-- Exécutable hors jeu avec : texlua addon/test-offline.lua addon/nistod
local root=assert(arg[1] or 'addon/nistod')
package.path=root..'/?.lua;'..package.path
package.preload.common=function()return {} end
_G.T=function(t)return t end
_G.addon={}
local count=0
local function ok(v,label)assert(v,'FAIL: '..label);count=count+1;io.write('OK '..count..': '..label..'\n')end
local catalog=require('catalog')
local packet_detector=require('packet_detector')
local function packet(opts)
    opts=opts or {}
    local bytes={}
    for i=1,32 do bytes[i]=0 end
    local function w(off,n,num)
        for i=1,n do bytes[off+i]=num%256;num=math.floor(num/256) end
    end
    w(0x08,4,opts.id or 12345678)
    w(0x16,2,opts.index or 204)
    w(0x18,2,opts.message or 6)
    return {id=opts.packet_id or 0x029,data=string.char(table.unpack(bytes)),blocked=opts.blocked, injected=opts.injected}
end
local entities={
    GetName=function(self,index)return index==204 and 'Behemoth' or nil end,
    GetServerId=function(self,index)return index==204 and 12345678 or 0 end,
}
ok(#catalog==37,'37 NM au catalogue')
local slugs={};for _,nm in ipairs(catalog)do assert(not slugs[nm.slug]);slugs[nm.slug]=true end
ok(slugs.behemoth and slugs.charybdis,'slugs uniques et NM connus')
ok(packet_detector.match(packet(),catalog,entities).slug=='behemoth','mort 0x029 message 6')
ok(packet_detector.match(packet({message=20}),catalog,entities).slug=='behemoth','mort 0x029 message 20')
ok(packet_detector.match(packet({message=0x8006}),catalog,entities).slug=='behemoth','message 6 avec bit drapeau')
ok(packet_detector.match(packet({blocked=true}),catalog,entities)~=nil,'filtre chat ou paquet bloqué sans effet sur lecture brute')
ok(packet_detector.match(packet({message=3}),catalog,entities)==nil,'pas de faux positif sur message ordinaire')
ok(packet_detector.match(packet({id=4567}),catalog,entities)==nil,'rejet identifiant serveur incorrect')
ok(packet_detector.match(packet({index=205}),catalog,entities)==nil,'rejet index entité incorrect')
ok(packet_detector.match(packet({injected=true}),catalog,entities)==nil,'rejet paquet injecté')
ok(packet_detector.match(packet({packet_id=0x028}),catalog,entities)==nil,'aucun match 0x028')
ok(packet_detector.match({id=0x029,data='abc'},catalog,entities)==nil,'rejet paquet tronqué')
local wrong={GetServerId=function()return 12345678 end,GetName=function()return 'Non-NM' end}
ok(packet_detector.match(packet(),catalog,wrong)==nil,'rejet nom non catalogue')
local callbacks,visible,pressed,logged,requests={},{},nil,{},{}
local fake_clock=os.time();local original_time=os.time
os.time=function(t)if t then return original_time(t) end return fake_clock end
local real_print=print
print=function(v)logged[#logged+1]=tostring(v) end
_G.AshitaCore={GetMemoryManager=function()return {GetEntity=function()return entities end} end}
_G.ashita={events={register=function(kind,key,fn)callbacks[kind]=fn end}}
package.preload.imgui=function()return {
 Begin=function(name,open)visible[#visible+1]=name;return true end,End=function()end,
 Text=function(s)visible[#visible+1]=s end,TextWrapped=function(s)visible[#visible+1]=s end,
 TextColored=function(_,s)visible[#visible+1]=s end,Separator=function()end,
 SameLine=function()end,Combo=function()end,
 Button=function(s)if pressed==s then pressed=nil;return true end return false end}
end
package.preload.nistod_local=function()return{port=38461,local_key='local-test-key'}end
package.preload['ltn12']=function()return {
 source={string=function(data)local sent=false;return function()if sent then return nil end;sent=true;return data end end},
 sink={table=function(reply)return function(chunk)if chunk then reply[#reply+1]=chunk end return 1 end end}
}end
package.preload['socket.http']=function()return{TIMEOUT=2,
 request=function(req)
    if req.method=='POST' then
        local body=req.source();requests[#requests+1]={url=req.url,body=body};
        req.sink('{"ok":true,"state":"queued"}');return true,202
    end
    local last=requests[#requests]
    local simulation=last and last.body:find('source=simulation',1,true)
    req.sink('{"ok":true,"state":"delivered","remote_state":"'..(simulation and 'simulation' or 'accepted')..'"}');
    return true,200
 end
}end
local function contains(list,pattern)
    for _,x in ipairs(list)do if tostring(x):find(pattern,1,true)then return true end end
    return false
end
local function frame(btn,offset)
    fake_clock=fake_clock+(offset or 1)
    visible={};pressed=btn;callbacks.d3d_present()
end
local function command(s)
    local args={};for word in s:gmatch('%S+')do args[#args+1]=word end
    local e={blocked=false,command={args=function()return args end}};callbacks.command(e)
    return e.blocked
end
package.loaded['socket.http']=nil;package.loaded['ltn12']=nil;dofile(root..'/nistod.lua')
ok(type(callbacks.packet_in)=='function','callback packet_in enregistré')
ok(callbacks.text_in==nil,'aucune dépendance text_in')
frame();ok(contains(visible,'AUTO PAQUETS 0x029'),'envoi auto actif avec relais configuré')
callbacks.packet_in(packet({blocked=true}));frame(nil,4)
ok(#requests==1 and requests[1].body:find('source=packet_death',1,true),'packet brut mis en file et envoyé au relais')
ok(requests[1].body:find('death_message_id=6',1,true)~=nil,'preuve de mort jointe')
frame(nil,4);ok(contains(logged,'ToD TRANSMIS et accepte : Behemoth'),'chat notifié après livraison distante')
callbacks.packet_in(packet({message=20}));frame(nil,4)
ok(#requests==1,'anti doublon same target sur 10 minutes')
ok(command('/nistod sim behemoth'),'commande de simulation reconnue')
frame(nil,4)
ok(#requests==2 and requests[2].body:find('source=simulation',1,true),'simulation envoyée via relais')
frame(nil,4)
ok(contains(logged,'SIMULATION RECUE par Cloudflare'),'simulation confirmée distincte du vrai ToD')
ok(command('/nistod auto off'),'auto off reconnu')
callbacks.packet_in(packet({message=6}));frame(nil,4)
ok(#requests==2,'auto off bloque envois packet')
ok(command('/nistod hide'),'hide reconnu');frame();ok(#visible==0,'fenêtre masquée')
ok(command('/nistod show'),'show reconnu');frame();ok(contains(visible,'NisToD Tracker'),'fenêtre réouverte')
ok(command('/nistod stop'),'stop reconnu');frame()
ok(contains(visible,'SIMULATION / AUCUN ENVOI'),'arrêt immédiat du scan + envoi')
print=real_print
io.write('TESTS LUA V0.3.1 : '..count..' VALIDÉS\n')

local root=assert(arg[1] or 'nistod','Addon folder required')
package.path=root..'/?.lua;'..package.path
package.preload.common=function() return {} end
_G.T=function(t)return t end
_G.addon={}
local callbacks,visible,pressed,chosen={}, {},nil,nil
_G.ashita={events={register=function(kind,key,fn)callbacks[kind]=fn end}}
package.preload.imgui=function()return{
 Begin=function(name,open) table.insert(visible,name);return true end,
 End=function()end,Text=function(s)table.insert(visible,s)end,
 TextWrapped=function(s)table.insert(visible,s)end,TextColored=function(c,s)table.insert(visible,s)end,
 Separator=function()end,SameLine=function()end,
 Combo=function(label,index,options)if chosen then index[1]=chosen end end,
 Button=function(s)if pressed==s then pressed=nil;return true end return false end
}end
local count=0
local function ok(x,label)assert(x,'FAIL '..label);count=count+1;print('OK '..count..': '..label)end
local function contains(s)for _,v in ipairs(visible)do if type(v)=='string' and v:find(s,1,true)then return true end end return false end
local function frame(btn,idx)visible={};pressed=btn;chosen=idx;callbacks.d3d_present();chosen=nil end
local function command(s)local args={};for w in s:gmatch('%S+')do args[#args+1]=w end;local e={blocked=false,command={args=function()return args end}};callbacks.command(e);return e.blocked end
local catalog=require('catalog')
local detector=require('detector')
ok(#catalog==37,'catalogue complet')
local slugs={};for _,nm in ipairs(catalog)do assert(not slugs[nm.slug]);slugs[nm.slug]=true end
ok(slugs.charybdis and slugs.behemoth,'slugs uniques présents')
ok(detector.match('You defeat the Behemoth.',catalog).slug=='behemoth','suggestion mort directe')
ok(detector.match('[12:34:56] Charybdis falls to the ground.',catalog).slug=='charybdis','suggestion timestamp')
ok(detector.match('You have spotted Behemoth.',catalog)==nil,'aucun kill sur observation')
ok(detector.match('Behemoth disappears.',catalog)==nil,'aucun kill sur disparition')
ok(detector.match('Someone says: You defeat the Behemoth.',catalog)==nil,'aucune suggestion chat libre préfixé')
dofile(root..'/nistod.lua')
ok(type(callbacks.d3d_present)=='function' and type(callbacks.text_in)=='function','callbacks render et chat')
frame();ok(contains('SIMULATION / AUCUN ENVOI'),'envoi désactivé au départ')
frame('Déclarer une mort constatée',2);ok(contains('CONFIRMATION HUMAINE OBLIGATOIRE'),'formulaire de confirmation locale')
frame('SIMULER CONFIRMATION');ok(contains('Simulation locale'),'simulation sans réseau')
callbacks.text_in({message_modified='You defeat the Behemoth.',injected=false,blocked=false})
frame();ok(contains('Suggestion combat, non confirmée'),'suggestion combat affichée')
frame('Vérifier cette mort');ok(contains('CONFIRMATION HUMAINE OBLIGATOIRE'),'suggestion nécessite seconde confirmation')
frame('Annuler la saisie');frame();ok(not contains('CONFIRMATION HUMAINE OBLIGATOIRE'),'annulation fonctionne')
ok(command('/nistod stop'),'commande stop')
frame();ok(contains('SIMULATION / AUCUN ENVOI'),'stop désactive envoi')
ok(command('/nistod hide'),'commande hide');frame();ok(#visible==0,'masquage de la fenêtre')
ok(command('/nistod show'),'commande show');frame();ok(contains('NisToD Tracker'),'réouverture de fenêtre')
ok(not command('/unknown'),'autres commandes non interceptées')
print('TESTS LUA : '..count..' VALIDÉS')

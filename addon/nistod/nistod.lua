-- NisToD Tracker v0.3.1 — Ashita4 / VanaCore
-- Passive 0x029 death detection, automatic local relay, explicit simulation route.
-- Does not modify packets, target mobs, issue commands, or touch gameplay.
addon.name = 'nistod';
addon.author = 'NisToD Tracker';
addon.version = '0.3.1';
addon.desc = 'Suivi ToD par paquet de combat, envoi automatique et simulation non publique.';
addon.link = 'https://github.com/Bogstyle/nistod-tracker';

require 'common';
local imgui = require 'imgui';
local catalog = require 'catalog';
local packet_detector = require 'packet_detector';
local local_ok, local_config = pcall(require, 'nistod_local');
if not local_ok or type(local_config) ~= 'table' then local_config = nil; end
local socket_ok, http = pcall(require, 'socket.http');
local ltn_ok, ltn12 = pcall(require, 'ltn12');

local state = {
    is_open = T{true}, selected_index = T{0}, pending = nil,
    last_result = 'Aucune observation.', last_request_id = nil, last_delivery = '',
    network_enabled = local_config ~= nil, auto_enabled = local_config ~= nil,
    scan_enabled = true, outbound = {}, inflight = {}, last_entity_death = {},
    next_counter = 0, last_flush = 0, last_check = 0, poll_cursor = nil,
};
local names = {};
for i = 1, #catalog do names[i] = catalog[i].name; end
local nm_options = table.concat(names, '\0') .. '\0\0';
math.randomseed(os.time());

local function selected_nm() return catalog[state.selected_index[1]+1]; end
local function utc_now() return os.date('!%Y-%m-%dT%H:%M:%SZ'); end
local function local_now() return os.date('%Y-%m-%d %H:%M:%S'); end
local function fresh_id()
    state.next_counter = state.next_counter + 1;
    return 'n' .. tostring(os.time()) .. '_' .. tostring(state.next_counter) .. '_' .. tostring(math.random(10000000,99999999));
end
local function create_pending(nm,source,observed_at,observed_epoch)
    if not nm then return; end
    state.pending = {
        nm_slug = nm.slug, nm_name = nm.name, zone = nm.zone,
        source = source, observed_at_utc = observed_at or utc_now(), observed_epoch = observed_epoch or os.time(), request_id = fresh_id()
    };
end
local function shift_pending(minutes)
    if not state.pending then return end
    local wanted=state.pending.observed_epoch+minutes*60;
    if wanted>os.time() or wanted<os.time()-14*86400 then return end
    state.pending.observed_epoch=wanted;
    state.pending.observed_at_utc=os.date('!%Y-%m-%dT%H:%M:%SZ',wanted);
end
local function urlenc(value)
    return tostring(value or ''):gsub('([^%w%-%_%.%~])',function(c) return ('%%%02X'):format(string.byte(c)); end);
end
local function relay_request(method,route,body)
    if not local_config or not socket_ok or not ltn_ok then
        return nil, 'Relais non configuré ou LuaSocket indisponible.';
    end
    -- All client requests are loopback only. No Discord token in game memory.
    local url='http://127.0.0.1:' .. tostring(local_config.port or 38461) .. route;
    local reply = {};
    local headers={['X-NisToD-Local-Key']=local_config.local_key};
    local data = nil;
    if method=='POST' then
        data = body or '';
        headers['content-type']='application/x-www-form-urlencoded';
        headers['content-length']=tostring(#data);
    end
    local old_timeout = http.TIMEOUT;
    -- Do not stall the game thread for an unavailable local relay.
    http.TIMEOUT=0.12;
    local ok, result, code = pcall(http.request, {
        url=url,method=method,headers=headers,
        source=data and ltn12.source.string(data) or nil,
        sink=ltn12.sink.table(reply)
    });
    http.TIMEOUT=old_timeout;
    if not ok then return nil, tostring(result):sub(1,180) end
    if not result then return nil, 'Relais injoignable : démarrer node relay/index.mjs start.' end
    return tonumber(code), table.concat(reply);
end
local function notify(message)
    -- Ashita print is rendered in the chat log; keep ASCII to avoid client encoding issues.
    print('[NisToD] ' .. tostring(message))
end
local function event_form(p)
    local simulation=(p.source=='simulation');
    local confirmed=simulation and 'no' or 'yes';
    return table.concat({
        'client_request_id=' .. urlenc(p.request_id),
        'nm_slug=' .. urlenc(p.nm_slug),
        'observed_at_utc=' .. urlenc(p.observed_at_utc),
        'source=' .. urlenc(p.source),
        'confirmed=' .. confirmed,
        'death_message_id=' .. urlenc(p.message_id or ''),
        'target_id=' .. urlenc(p.target_id or ''),
    },'&')
end
local function enqueue(p)
    if #state.outbound>=40 then
        state.last_result='File locale pleine. ToD non transmis : '..p.nm_name;
        notify(state.last_result);
        return false
    end
    state.outbound[#state.outbound+1]=p;
    return true
end
local function send_pending()
    local p=state.pending;
    if not p then return end
    if not state.network_enabled then
        state.last_result='Simulation locale (envoi désactivé) : '..p.nm_name;
        state.pending=nil;
        return
    end
    if enqueue(p) then
        state.last_result='ToD en attente d envoi : '..p.nm_name;
        state.pending=nil
    end
end
local function flush_one()
    if not state.network_enabled or #state.outbound==0 then return end
    local p=state.outbound[1];
    local code,response=relay_request('POST','/submit',event_form(p));
    if code==202 then
        table.remove(state.outbound,1);
        state.inflight[p.request_id]=p;
        state.last_request_id=p.request_id;
        state.last_delivery='queued';
        state.last_result='En attente de confirmation du serveur : '..p.nm_name;
    else
        state.last_result='Relais indisponible (ToD conserve localement) : '..p.nm_name;
        if not p.warned then notify(state.last_result);p.warned=true end
    end
end
local function poll_one()
    local id,p=next(state.inflight,state.poll_cursor);
    if not id then id,p=next(state.inflight) end
    if not id or not p then return end
    state.poll_cursor=id;
    local code,body=relay_request('GET','/status?id='..urlenc(id));
    if code~=200 then return end
    local delivery=(body or ''):match('"state"%s*:%s*"([a-z]+)"') or 'unknown';
    local remote=(body or ''):match('"remote_state"%s*:%s*"([a-z_]+)"') or '';
    state.last_delivery=delivery;
    if delivery=='delivered' then
        if p.source=='simulation' then
            notify('SIMULATION RECUE par Cloudflare pour '..p.nm_name..' : aucun ToD publie.');
            state.last_result='Simulation acceptee (aucun ToD cree) : '..p.nm_name;
        elseif remote=='conflict' then
            notify('Signalement contradictoire journalise : '..p.nm_name);
            state.last_result='ToD contradictoire : '..p.nm_name;
        else
            notify('ToD TRANSMIS et accepte : '..p.nm_name..' / '..p.observed_at_utc);
            state.last_result='ToD transmis : '..p.nm_name;
        end
        state.inflight[id]=nil;state.poll_cursor=nil;
    elseif delivery=='failed' then
        notify('ECHEC ToD '..p.nm_name..' : verifier appairage / relais.');
        state.last_result='Echec transmis : '..p.nm_name;
        state.inflight[id]=nil;state.poll_cursor=nil;
        state.last_request_id=id;
    end
end
local function retry_failed()
    if not state.last_request_id then return end
    local body='id=' .. urlenc(state.last_request_id);
    local code,result=relay_request('POST','/retry',body);
    if code==202 then state.last_delivery='queued';state.last_result='Réessai demandé au relais';
    else state.last_result='Réessai refusé : '..tostring(result or code or '-'); end
end
local function check_delivery()
    -- Manual poll still available to inspect the most recent item.
    local id=state.last_request_id;
    if not id then return end
    local code,body=relay_request('GET','/status?id='..urlenc(id));
    if code==200 then
        state.last_delivery=(body or ''):match('"state"%s*:%s*"([a-z]+)"') or 'unknown';
        state.last_result='État relais : '..state.last_delivery;
    else state.last_result='Relais injoignable'; end
end
local function tick()
    if not state.network_enabled then return end
    local now=os.time();
    if now-state.last_flush>=3 then
        state.last_flush=now;
        flush_one();
    end
    if now-state.last_check>=4 then
        state.last_check=now;
        poll_one();
    end
end
local function simulate(slug)
    local nm=nil;
    for _,entry in ipairs(catalog) do
        if entry.slug==slug or entry.name:lower()==slug then nm=entry;break end
    end
    if not nm then notify('NM inconnu. Utilise un slug du catalogue (ex : behemoth).');return end
    if not state.network_enabled then notify('Relais non configure ou envoi desactive. Aucun test transmis.');return end
    if enqueue({nm_slug=nm.slug,nm_name=nm.name,observed_at_utc=utc_now(),
        source='simulation',request_id=fresh_id()}) then
        state.last_result='Simulation en attente : '..nm.name;
        notify('Simulation demandee pour '..nm.name..' (pas de ToD public).');
    end
end
local function render()
    if not state.is_open[1] then return end
    if imgui.Begin('NisToD Tracker v0.3.1',state.is_open) then
        imgui.TextColored({0.4,0.85,0.95,1},'CatsEyeXI - suivi collaboratif des NM');
        imgui.Separator();
        if not local_config then
            imgui.TextColored({1,0.5,0.3,1},'Configuration locale absente : mode simulation.');
        elseif not socket_ok or not ltn_ok then
            imgui.TextColored({1,0.5,0.3,1},'LuaSocket indisponible : mode simulation.');
        else
            imgui.Text('Relais configure sur 127.0.0.1:' .. tostring(local_config.port or 38461));
        end
        imgui.Text('Mode : ' .. (state.network_enabled and (state.auto_enabled and 'AUTO PAQUETS 0x029' or 'ENVOI MANUEL') or 'SIMULATION / AUCUN ENVOI'));
        if imgui.Button(state.network_enabled and 'Désactiver tout envoi' or 'Activer l envoi') then
            state.network_enabled = not state.network_enabled;
            if not state.network_enabled then state.auto_enabled=false end;
        end
        imgui.SameLine();
        if imgui.Button(state.auto_enabled and 'Suspendre auto ToD' or 'Activer auto ToD') then
            state.auto_enabled=not state.auto_enabled;
            if state.auto_enabled then state.network_enabled=true end;
        end
        imgui.Separator();
        imgui.Text('NM disponibles : '..tostring(#catalog));
        imgui.Combo('NM',state.selected_index,nm_options);
        local nm=selected_nm();
        if nm then imgui.TextWrapped('Zone catalogue : '..(nm.zone~='' and nm.zone or '(non renseignée)')); end
        imgui.Text('Heure locale : '..local_now());
        imgui.Text('UTC : '..utc_now());
        if imgui.Button('Déclarer une mort constatée') then
            create_pending(nm,'manual',utc_now());
        end
        if state.pending then
            local p=state.pending;
            imgui.Separator();
            imgui.TextColored({0.65,0.95,0.72,1},'CONFIRMATION MANUELLE (pour saisie manuelle uniquement)');
            imgui.Text('NM : '..p.nm_name);
            imgui.Text('Zone : '..(p.zone~='' and p.zone or '(non documentée)'));
            imgui.Text('ToD UTC : '..p.observed_at_utc);
            if imgui.Button('-5 min') then shift_pending(-5) end
            imgui.SameLine();if imgui.Button('-1 min') then shift_pending(-1) end
            imgui.SameLine();if imgui.Button('+1 min') then shift_pending(1) end
            imgui.SameLine();if imgui.Button('+5 min') then shift_pending(5) end
            imgui.TextWrapped('Confirme uniquement si tu as réellement constaté sa mort. Une disparition ou un simple message ambigu ne suffit pas.');
            if imgui.Button(state.network_enabled and 'CONFIRMER ET TRANSMETTRE' or 'SIMULER CONFIRMATION') then
                send_pending();
            end
            imgui.SameLine();
            if imgui.Button('Annuler la saisie') then state.pending=nil;end
        end
        imgui.Separator();
        imgui.TextWrapped('État : '..state.last_result);
        imgui.Text('En file locale : '..#state.outbound);
        imgui.Text('Simulation : /nistod sim behemoth');
        if state.last_request_id and imgui.Button('Vérifier le résultat Discord') then check_delivery() end
        if state.last_request_id and state.last_delivery=='failed' and imgui.Button('Réessayer le même ToD') then retry_failed() end
        imgui.TextColored({1,0.62,0.4,1},'Aucune commande, cible ou attaque automatisée.');
    end
    imgui.End();
end
ashita.events.register('d3d_present','nistod_render_cb',function() tick();render(); end);
ashita.events.register('packet_in','nistod_packet_cb',function(e)
    if not state.scan_enabled or not state.auto_enabled or not state.network_enabled then return end
    local entities=nil;
    local ok,manager=pcall(function() return AshitaCore:GetMemoryManager():GetEntity() end);
    if ok then entities=manager end
    local observation=packet_detector.match(e,catalog,entities);
    if not observation then return end
    local now=os.time();
    local key=tostring(observation.target_id)..':'..observation.slug;
    if now-(state.last_entity_death[key] or 0)<600 then return end
    state.last_entity_death[key]=now;
    -- The packet callback only records. All network I/O happens in d3d_present.
    enqueue({nm_slug=observation.slug,nm_name=observation.name,
        observed_at_utc=utc_now(),source='packet_death',
        message_id=observation.message_id,target_id=observation.target_id,
        request_id=fresh_id()});
end);
ashita.events.register('command','nistod_command_cb',function(e)
    local args=e.command:args();
    if #args==0 or args[1]~='/nistod' then return end
    e.blocked=true;
    local cmd=(args[2] or 'toggle'):lower();
    if cmd=='show' then state.is_open[1]=true;
    elseif cmd=='hide' then state.is_open[1]=false;
    elseif cmd=='stop' then state.scan_enabled=false;state.auto_enabled=false;state.network_enabled=false;
    elseif cmd=='start' then state.scan_enabled=true;state.network_enabled=(local_config~=nil);state.auto_enabled=state.network_enabled;state.is_open[1]=true;
    elseif cmd=='auto' then
        if args[3]=='off' then state.auto_enabled=false;
        elseif args[3]=='on' then state.auto_enabled=(local_config~=nil);state.network_enabled=state.auto_enabled end;
        notify('Auto ToD : '..(state.auto_enabled and 'ON' or 'OFF'));
    elseif cmd=='sim' then simulate((args[3] or 'behemoth'):lower());
    elseif cmd=='status' then notify(state.last_result..' | auto='..tostring(state.auto_enabled));
    else state.is_open[1]=not state.is_open[1]; end
end);

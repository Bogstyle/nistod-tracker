-- NisToD Tracker v0.3.0 — Ashita4 / VanaCore
-- Passive local combat-log suggestion + manual human confirmation.
-- Sends ONLY to 127.0.0.1 companion relay after explicit opt-in and click.
addon.name = 'nistod';
addon.author = 'NisToD Tracker';
addon.version = '0.3.0';
addon.desc = 'Suivi de morts NM avec confirmation manuelle et relais local.';
addon.link = 'https://github.com/Bogstyle/nistod-tracker';

require 'common';
local imgui = require 'imgui';
local catalog = require 'catalog';
local detector = require 'detector';
local local_ok, local_config = pcall(require, 'nistod_local');
if not local_ok or type(local_config) ~= 'table' then local_config = nil; end
local socket_ok, http = pcall(require, 'socket.http');
local ltn_ok, ltn12 = pcall(require, 'ltn12');

local state = {
    is_open = T{true}, selected_index = T{0}, pending = nil,
    suggestion = nil, last_result = 'Aucune observation.',
    last_request_id = nil, last_delivery = '',
    network_enabled = false, scan_enabled = true,
    next_counter = 0, last_suggestion_id = '',
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
    http.TIMEOUT=0.35;
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
local function send_pending()
    local p=state.pending;
    if not p then return end
    if not state.network_enabled then
        state.last_result='Simulation locale (envoi désactivé) : ' .. p.nm_name .. ' / ' .. p.observed_at_utc;
        state.pending=nil;
        return
    end
    local data={
        'client_request_id=' .. urlenc(p.request_id),
        'nm_slug=' .. urlenc(p.nm_slug),
        'observed_at_utc=' .. urlenc(p.observed_at_utc),
        'source=' .. urlenc(p.source),
        'confirmed=yes'
    };
    local status, response=relay_request('POST','/submit',table.concat(data,'&'));
    if status==202 then
        state.last_result='ToD confié au relais (pas encore confirmé côté Discord) : ' .. p.nm_name;
        state.last_request_id=p.request_id;
        state.last_delivery='queued';
        state.pending=nil;
    else
        state.last_result='Envoi non effectué : HTTP ' .. tostring(status or '-') .. ' ' .. tostring(response or '');
        -- Keep pending and its idempotency key intact for retry.
    end
end
local function check_delivery()
    if not state.last_request_id then return end
    local code, body=relay_request('GET','/status?id=' .. urlenc(state.last_request_id));
    if code==200 then
        local delivery=(body or ''):match('"state"%s*:%s*"([a-z]+)"') or 'unknown';
        local detail=(body or ''):match('"message"%s*:%s*"([^"]*)"') or '';
        state.last_delivery=delivery;
        state.last_result=(delivery=='delivered' and '✅ Envoi terminé : ')
          or (delivery=='failed' and '❌ Échec de transmission : ')
          or '⏳ En attente : ';
        state.last_result=state.last_result .. detail;
    else
        state.last_result='Suivi du relais indisponible. HTTP ' .. tostring(code or '-') .. '.';
    end
end
local function retry_failed()
    if not state.last_request_id then return end
    local body='id=' .. urlenc(state.last_request_id);
    local code, result=relay_request('POST','/retry',body);
    if code==202 then state.last_delivery='queued';state.last_result='Réessai demandé au relais';
    else state.last_result='Réessai refusé : '..tostring(result or code or '-'); end
end
local function render()
    if not state.is_open[1] then return end
    if imgui.Begin('NisToD Tracker v0.3.0',state.is_open) then
        imgui.TextColored({0.4,0.85,0.95,1},'CatsEyeXI - suivi collaboratif des NM');
        imgui.Separator();
        if not local_config then
            imgui.TextColored({1,0.5,0.3,1},'Configuration locale absente : mode simulation.');
        elseif not socket_ok or not ltn_ok then
            imgui.TextColored({1,0.5,0.3,1},'LuaSocket indisponible : mode simulation.');
        else
            imgui.Text('Relais configure sur 127.0.0.1:' .. tostring(local_config.port or 38461));
        end
        imgui.Text('Mode : ' .. (state.network_enabled and 'ENVOI ACTIVÉ' or 'SIMULATION / AUCUN ENVOI'));
        if imgui.Button(state.network_enabled and 'Désactiver tout envoi' or 'Activer envoi manuel') then
            state.network_enabled = not state.network_enabled;
        end
        imgui.SameLine();
        if imgui.Button(state.scan_enabled and 'Pause suggestions' or 'Reprendre suggestions') then
            state.scan_enabled=not state.scan_enabled;
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
        if state.suggestion then
            local s=state.suggestion;
            imgui.Separator();
            imgui.TextColored({1,0.78,0.36,1},'Suggestion combat, non confirmée');
            imgui.TextWrapped(s.nm_name .. ' - '..s.observed_at_utc);
            if imgui.Button('Vérifier cette mort') then
                create_pending(catalog[s.index],'chat_suggestion',s.observed_at_utc,s.observed_epoch);
                state.suggestion=nil;
            end
            imgui.SameLine();
            if imgui.Button('Ignorer') then state.suggestion=nil; end
        end
        if state.pending then
            local p=state.pending;
            imgui.Separator();
            imgui.TextColored({0.65,0.95,0.72,1},'CONFIRMATION HUMAINE OBLIGATOIRE');
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
        if state.last_request_id and imgui.Button('Vérifier le résultat Discord') then check_delivery() end
        if state.last_request_id and state.last_delivery=='failed' and imgui.Button('Réessayer le même ToD') then retry_failed() end
        imgui.TextColored({1,0.62,0.4,1},'Aucune commande, cible ou attaque automatisée.');
    end
    imgui.End();
end
ashita.events.register('d3d_present','nistod_render_cb',function() render(); end);
ashita.events.register('text_in','nistod_text_cb',function(e)
    if not state.scan_enabled or e.injected or e.blocked then return end
    local observation=detector.match(e.message_modified or e.message,catalog);
    if not observation then return end
    local observed_epoch=os.time();
    local timestamp=utc_now();
    local identifier=observation.slug..'/'..timestamp;
    if identifier==state.last_suggestion_id then return end
    state.last_suggestion_id=identifier;
    state.suggestion={index=observation.index,nm_name=observation.name,observed_at_utc=timestamp,observed_epoch=observed_epoch};
end);
ashita.events.register('command','nistod_command_cb',function(e)
    local args=e.command:args();
    if #args==0 or args[1]~='/nistod' then return end
    e.blocked=true;
    local cmd=(args[2] or 'toggle'):lower();
    if cmd=='show' then state.is_open[1]=true;
    elseif cmd=='hide' then state.is_open[1]=false;
    elseif cmd=='stop' then state.scan_enabled=false;state.network_enabled=false;state.suggestion=nil;state.pending=nil;
    elseif cmd=='start' then state.scan_enabled=true;state.is_open[1]=true;
    elseif cmd=='status' then print('[NisToD] '..state.last_result);
    else state.is_open[1]=not state.is_open[1]; end
end);

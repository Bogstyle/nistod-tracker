-- NisToD - Maquette locale v0.0.1 (Ashita v4 / VanaCore)
-- ZERO reseau, ZERO lecture de paquets, ZERO enregistrement de ToD.
-- Prototype de revue et de validation UI : NE PAS DEPLOYER EN JEU
-- AVANT VALIDATION DU STAFF CatsEyeXI pour le projet complet.
addon.name = 'nistod';
addon.author = 'NisToD Tracker';
addon.version = '0.0.1';
addon.desc = 'Maquette locale et manuelle de declaration ToD (sans envoi).';
addon.link = '';

require 'common';
local imgui = require 'imgui';
local catalog = require 'catalog';

local view = T{
    is_open = T{ true },
    selected_index = T{ 0 },
    pending = nil,
    last_preview = 'Aucune simulation effectuee.',
};

local labels = {};
for i = 1, #catalog do
    labels[#labels + 1] = catalog[i].name;
end
-- Combo ImGui : chaine NUL-separee ; indices commencent a zero.
local nm_options = table.concat(labels, '\0') .. '\0\0';

local function selected_nm()
    return catalog[view.selected_index[1] + 1];
end

local function open_preview(kind)
    local nm = selected_nm();
    if (nm == nil) then return; end
    -- L'heure n'est figee qu'au moment du clic explicite.
    local utc = os.date('!%Y-%m-%dT%H:%M:%SZ');
    local local_time = os.date('%Y-%m-%d %H:%M:%S');
    view.pending = {
        kind = kind,
        slug = nm.slug,
        name = nm.name,
        zone = nm.zone,
        observed_at_utc = utc,
        observed_at_local = local_time,
    };
end

local function render()
    if (not view.is_open[1]) then return; end

    if (imgui.Begin('NisToD - MAQUETTE LOCALE', view.is_open)) then
        imgui.TextColored({ 1.0, 0.72, 0.25, 1.0 }, 'MODE DEMONSTRATION - AUCUNE TRANSMISSION');
        imgui.Separator();
        imgui.Text('Catalogue CatsEyeXI : ' .. tostring(#catalog) .. ' NM');
        imgui.Combo('NM suivi', view.selected_index, nm_options);
        local nm = selected_nm();
        if (nm ~= nil) then
            imgui.Text('Zone documentee : ' .. ((nm.zone ~= '' and nm.zone) or '(a verifier)'));
        end
        imgui.Text('Heure locale : ' .. os.date('%Y-%m-%d %H:%M:%S'));
        imgui.Text('Heure UTC : ' .. os.date('!%Y-%m-%d %H:%M:%S') .. 'Z');
        imgui.Separator();
        if (imgui.Button('Vu vivant - simulation')) then
            open_preview('SIGHTING_ALIVE');
        end
        imgui.SameLine();
        if (imgui.Button('Mort observee - simulation')) then
            open_preview('KILL_CONFIRMED');
        end

        if (view.pending ~= nil) then
            local p = view.pending;
            imgui.Separator();
            imgui.TextColored({ 0.80, 0.90, 1.0, 1.0 }, 'Confirmation locale');
            imgui.Text('Evenement : ' .. p.kind);
            imgui.Text('NM : ' .. p.name);
            imgui.Text('Zone : ' .. ((p.zone ~= '' and p.zone) or '(non renseignee)'));
            imgui.Text('Heure : ' .. p.observed_at_local .. ' (locale)');
            imgui.Text('UTC : ' .. p.observed_at_utc);
            if (imgui.Button('Simuler la confirmation')) then
                view.last_preview = p.kind .. ' / ' .. p.name .. ' / ' .. p.observed_at_utc;
                view.pending = nil;
            end
            imgui.SameLine();
            if (imgui.Button('Annuler')) then
                view.pending = nil;
            end
        end
        imgui.Separator();
        imgui.Text('Derniere simulation :');
        imgui.TextWrapped(view.last_preview);
        imgui.TextColored({ 1.0, 0.45, 0.45, 1.0 }, 'Aucun ToD n est publie. Aucun acces Worker / Discord.');
    end
    imgui.End();
end

ashita.events.register('d3d_present', 'nistod_present_cb', function ()
    render();
end);

ashita.events.register('command', 'nistod_command_cb', function (e)
    local args = e.command:args();
    if (#args == 0 or args[1] ~= '/nistod') then return; end
    e.blocked = true;
    if (#args >= 2 and args[2] == 'hide') then
        view.is_open[1] = false;
    elseif (#args >= 2 and args[2] == 'show') then
        view.is_open[1] = true;
    else
        view.is_open[1] = not view.is_open[1];
    end
end);

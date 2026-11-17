-- NisToD v0.3.1: read-only detection of explicit death action messages.
-- Uses the ORIGINAL 0x029 packet, before chat rendering/filtering.
-- FFXI message 6 = actor defeats target; 20 = target falls to ground.
-- No outgoing packet or gameplay action. Fail closed if the client cannot
-- verify target server ID AND exact local entity name at packet arrival.
local M = {}
local DEATH = {[6]=true,[20]=true}
local function u16(data,offset)
    local a,b=data:byte(offset+1,offset+2)
    if not a or not b then return nil end
    return a+b*256
end
local function u32(data,offset)
    local a,b,c,d=data:byte(offset+1,offset+4)
    if not d then return nil end
    return a+b*256+c*65536+d*16777216
end
function M.match(packet,catalog,entity_manager)
    if type(packet)~='table' or packet.id~=0x029 or packet.injected then return nil end
    local raw=packet.data -- never e.data_modified or text_in
    if type(raw)~='string' or #raw<0x1A or not entity_manager then return nil end
    -- 0x029: target-id at 0x08, target-index at 0x16, message at 0x18.
    local target_id=u32(raw,0x08)
    local target_index=u16(raw,0x16)
    local message=u16(raw,0x18)
    if not target_id or not target_index or not message then return nil end
    message=message%0x8000 -- remove display message flags
    if not DEATH[message] then return nil end
    target_index=target_index%0x800
    if target_id==0 or target_index==0 then return nil end
    local ok_id,actual_id=pcall(function() return entity_manager:GetServerId(target_index) end)
    if not ok_id or tonumber(actual_id)~=target_id then return nil end
    local ok_name,name=pcall(function() return entity_manager:GetName(target_index) end)
    if not ok_name or type(name)~='string' or name=='' then return nil end
    local clean=name:lower():gsub('%s+$','')
    for index,nm in ipairs(catalog) do
        if nm.name:lower()==clean then
            return {index=index,slug=nm.slug,name=nm.name,
                kind='packet_death',target_id=target_id,target_index=target_index,message_id=message}
        end
    end
    return nil
end
return M

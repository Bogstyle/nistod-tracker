-- NisToD v0.3.0 — suggestions only, never proof of death.
-- Strict English combat-log patterns. Real CatsEyeXI phrasing must be verified in game.
local detector = {};
local function clean(raw)
    local s = tostring(raw or '')
    -- Client color / auto-translate control bytes (without modifying chat text).
    s = s:gsub('[\001-\031]', '')
    s = s:gsub('^%s*%[%d%d:%d%d:%d%d%]%s*', '')
    s = s:lower():gsub('%s+', ' '):gsub('^%s+', ''):gsub('%s+$', '')
    return s
end
function detector.match(raw, catalog)
    local s = clean(raw)
    local candidate = s:match('^you defeat the (.+)%.$')
        or s:match('^you defeat (.+)%.$')
        or s:match('^the (.+) is defeated%.$')
        or s:match('^(.+) falls to the ground%.$')
    if not candidate then return nil end
    candidate = candidate:gsub('^the ', '')
    for index, nm in ipairs(catalog) do
        if nm.name:lower() == candidate then
            return {index=index,slug=nm.slug,name=nm.name,kind='chat_suggestion'}
        end
    end
    return nil
end
return detector

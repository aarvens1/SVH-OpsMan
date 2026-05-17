-- SVH OpsMan — WezTerm config
-- Repo: ~/SVH-OpsMan/dotfiles/wezterm.lua
-- Symlinked to: C:\Users\astevens\.config\wezterm\wezterm.lua

local wezterm = require 'wezterm'
local act     = wezterm.action
local config  = wezterm.config_builder()

-- ── Catppuccin Mocha palette (referenced throughout) ─────────────────────────
local C = {
  base    = '#1e1e2e',
  mantle  = '#181825',
  surface0= '#313244',
  surface1= '#45475a',
  overlay1= '#7f849c',
  text    = '#cdd6f4',
  subtext0= '#a6adc8',
  blue    = '#89b4fa',
  sapphire= '#74c7ec',
  green   = '#a6e3a1',
  yellow  = '#f9e2af',
  peach   = '#fab387',
  red     = '#f38ba8',
  mauve   = '#cba6f7',
  teal    = '#94e2d5',
}

-- ── Appearance ────────────────────────────────────────────────────────────────
config.color_scheme = 'Catppuccin Mocha'
config.font         = wezterm.font('Cascadia Code NF', { weight = 'Regular' })
config.font_size    = 11.5

config.window_decorations = 'RESIZE'
config.initial_cols       = 240
config.initial_rows       = 52
config.window_padding     = { left = 6, right = 6, top = 6, bottom = 0 }
config.scrollback_lines   = 10000
config.enable_scroll_bar  = true

-- Reduce flicker on resize
config.animation_fps        = 1
config.cursor_blink_ease_in = 'Constant'
config.cursor_blink_ease_out= 'Constant'

config.selection_word_boundary = ' \t\n{}[]()"\'`,;:@│'
config.use_ime = false

-- ── Tab bar ───────────────────────────────────────────────────────────────────
config.tab_bar_at_bottom        = true
config.use_fancy_tab_bar        = false
config.hide_tab_bar_if_only_one_tab = false
config.tab_max_width            = 28
config.show_new_tab_button_in_tab_bar = true

config.colors = {
  tab_bar = {
    background         = C.mantle,
    active_tab         = { bg_color = C.surface0, fg_color = C.text,     intensity = 'Bold' },
    inactive_tab       = { bg_color = C.mantle,   fg_color = C.overlay1                     },
    inactive_tab_hover = { bg_color = C.surface0, fg_color = C.subtext0                     },
    new_tab            = { bg_color = C.mantle,   fg_color = C.overlay1                     },
    new_tab_hover      = { bg_color = C.surface0, fg_color = C.text                         },
  },
}

-- Colour-code tabs by shell type
local function proc_type(proc)
  proc = (proc or ''):lower()
  if proc:find('node') or proc:find('claude') then return 'claude'     end
  if proc:find('pwsh') or proc:find('powershell')  then return 'pwsh'  end
  return 'bash'
end

local TAB_ACCENT = { claude = C.blue, pwsh = C.yellow, bash = C.green }

wezterm.on('format-tab-title', function(tab, _tabs, _panes, _cfg, _hover, _max)
  local proc  = tab.active_pane.foreground_process_name
  local kind  = proc_type(proc)
  local color = TAB_ACCENT[kind] or C.text

  -- Friendly tab title: node → Claude, empty/wsl → bash
  local title = tab.tab_title
  if title == '' or title == proc or (title or ''):find('wsl') then
    if kind == 'claude' then title = 'Claude'
    elseif kind == 'pwsh' then title = 'pwsh'
    else title = 'bash' end
  end

  local bar = tab.is_active and '▌' or ' '

  return {
    { Foreground = { Color = color } },
    { Text = bar },
    { Foreground = { Color = tab.is_active and C.text or C.overlay1 } },
    { Text = ' ' .. title .. ' ' },
  }
end)

-- ── Status bar ────────────────────────────────────────────────────────────────
-- Two-layer cache:
--   _slow — BW unlock state + MCP data from status-refresh.sh cache file (120s TTL)
--   _git  — per-pane branch + dirty flag (15s TTL)

local _slow = { data = {}, ts = 0 }
local _git  = {}  -- keyed by pane_id
local SLOW_TTL = 120
local GIT_TTL  = 15

local function refresh_slow()
  if os.time() - _slow.ts < SLOW_TTL then return end

  local d = {}

  -- Bitwarden session check (local socket, fast)
  local bw_ok, bw_out = wezterm.run_child_process({
    'wsl.exe', '-e', 'bash', '-c', 'bw status 2>/dev/null'
  })
  d.bw = bw_ok and (bw_out or ''):find('"status":"unlocked"') ~= nil

  -- MCP status cache — written by dotfiles/status-refresh.sh
  local _, cache_out = wezterm.run_child_process({
    'wsl.exe', '-e', 'bash', '-c',
    'cat /tmp/svh-opsman-status.json 2>/dev/null'
  })
  if cache_out and #cache_out > 4 then
    local function int(key)
      return tonumber(cache_out:match('"' .. key .. '":(%d+)'))
    end
    d.wazuh = int('wazuh')
    d.mde   = int('mde')
    d.risky = int('risky')
    d.ninja = cache_out:match('"ninja":"([^"]*)"')
    d.m365  = cache_out:match('"m365":"([^"]*)"')
    d.unifi = cache_out:match('"unifi":"([^"]*)"')
    d.stale = cache_out:find('"stale":true') ~= nil
  end

  _slow = { data = d, ts = os.time() }
end

local function refresh_git(pane_id, cwd_path)
  local entry = _git[pane_id]
  if entry and os.time() - entry.ts < GIT_TTL then return entry.text end

  local text = ''
  if cwd_path and cwd_path ~= '' then
    -- path safe for single-quoting (typical WSL paths have no single quotes)
    local q = "'" .. cwd_path:gsub("'", "'\"'\"'") .. "'"
    local ok, out = wezterm.run_child_process({
      'wsl.exe', '-e', 'bash', '-c',
      'git -C ' .. q .. ' symbolic-ref --short HEAD 2>/dev/null && '
      .. 'printf "_D%d" $(git -C ' .. q .. ' status --porcelain 2>/dev/null | wc -l)'
    })
    if ok and out ~= '' then
      local branch = out:match('^([^\n]+)')
      local dirty  = tonumber(out:match('_D(%d+)')) or 0
      if branch then
        text = ' ' .. branch .. (dirty > 0 and '*' or '') .. ' '
      end
    end
  end

  _git[pane_id] = { text = text, ts = os.time() }
  return text
end

local function alert_color(n, warn_at, crit_at)
  if not n then return C.overlay1 end
  if n >= crit_at then return C.red end
  if n >= warn_at then return C.yellow end
  return C.green
end

wezterm.on('update-right-status', function(window, pane)
  refresh_slow()
  local d  = _slow.data
  local id = pane:pane_id()

  -- Git branch from current pane cwd
  local git_text = ''
  local cwd_url  = pane:get_current_working_dir()
  if cwd_url then
    local path = type(cwd_url) == 'string' and cwd_url:match('^file:///(.+)') or cwd_url.file_path
    git_text = refresh_git(id, path)
  end

  -- NinjaOne ratio colour
  local ninja_text  = d.ninja or '?/?'
  local ninja_color = C.overlay1
  do
    local on, tot = ninja_text:match('(%d+)/(%d+)')
    on, tot = tonumber(on), tonumber(tot)
    if on and tot and tot > 0 then
      ninja_color = (on == tot) and C.green or (on >= tot * 0.9 and C.yellow or C.red)
    end
  end

  -- M365 / UniFi — green if nominal, orange if not
  local m365_color  = (d.m365  == '✓') and C.green  or C.peach
  local unifi_color = (d.unifi == '✓') and C.green  or C.peach

  -- Staleness warning (all MCP fields nil = refresh script not running)
  local stale = d.stale or (d.wazuh == nil and d.mde == nil and d.risky == nil)

  -- Timestamp since last slow refresh
  local age_min = _slow.ts > 0 and math.floor((os.time() - _slow.ts) / 60) or nil
  local ts_text = age_min and (tostring(age_min) .. 'm') or '--'

  -- Build element list
  local el = {}
  local function add(color, text)
    el[#el+1] = { Foreground = { Color = color } }
    el[#el+1] = { Text = text }
  end
  local function dot()
    el[#el+1] = { Foreground = { Color = C.surface1 } }
    el[#el+1] = { Text = ' · ' }
  end

  if stale then
    add(C.peach, ' ⚠ ')
    dot()
  end

  add(d.bw and C.green or C.red, ' ' .. (d.bw and 'BW ✓' or 'BW ✗'))
  dot()
  add(alert_color(d.wazuh, 5, 20), 'Wazuh ' .. (d.wazuh ~= nil and tostring(d.wazuh) or '?'))
  dot()
  add(alert_color(d.mde,   1,  5), 'MDE '   .. (d.mde   ~= nil and tostring(d.mde)   or '?'))
  dot()
  add(alert_color(d.risky, 1,  3), 'Risky ' .. (d.risky ~= nil and tostring(d.risky) or '?'))
  dot()
  add(ninja_color,  'Ninja ' .. ninja_text)
  dot()
  add(m365_color,   'M365 '  .. (d.m365  or '?'))
  dot()
  add(unifi_color,  'UniFi ' .. (d.unifi or '?'))
  dot()
  if git_text ~= '' then
    add(C.subtext0, git_text)
    dot()
  end
  add(C.overlay1, ts_text .. ' ')

  window:set_right_status(wezterm.format(el))
end)

-- ── Hyperlink rules ───────────────────────────────────────────────────────────
config.hyperlink_rules = wezterm.default_hyperlink_rules()

-- obsidian:// deep links — click to open note directly in Obsidian
table.insert(config.hyperlink_rules, {
  regex  = [=[\bobsidian://[^\s'"<>)\]]+]=],
  format = '$0',
})

-- ── Leader key ────────────────────────────────────────────────────────────────
-- CTRL+\ — doesn't conflict with Claude Code, bash readline, or PowerShell
config.leader = { key = '\\', mods = 'CTRL', timeout_milliseconds = 1500 }

-- ── Keybindings ───────────────────────────────────────────────────────────────
-- Helper: type a slash-command and submit it to the active Claude pane
local function skill(cmd)
  return act.Multiple {
    act.SendString(cmd),
    act.SendKey { key = 'Enter' },
  }
end

config.keys = {

  -- ── Skill invocation (LEADER + letter) ───────────────────────────────────
  { key = 'd', mods = 'LEADER', action = skill('/day-starter')           },
  { key = 'e', mods = 'LEADER', action = skill('/day-ender')             },
  { key = 'w', mods = 'LEADER', action = skill('/week-starter')          },
  { key = 'p', mods = 'LEADER', action = skill('/posture-check')         },
  { key = 't', mods = 'LEADER', action = skill('/troubleshoot')          },
  { key = 'n', mods = 'LEADER', action = skill('/network-troubleshooter')},
  { key = 'c', mods = 'LEADER', action = skill('/change-record')         },
  { key = 'v', mods = 'LEADER', action = skill('/vuln-triage')           },
  { key = 'a', mods = 'LEADER', action = skill('/asset-investigation')   },
  { key = 'x', mods = 'LEADER', action = skill('/patch-campaign')        },

  -- ── Tab management ────────────────────────────────────────────────────────
  -- New Claude tab (opens WSL login bash → navigates to OpsMan → starts claude)
  -- -l = login shell so PATH/BW_SESSION/nvm are sourced before exec-ing claude
  { key = 'C', mods = 'LEADER',
    action = act.SpawnCommandInNewTab {
      label = 'Claude',
      args  = { 'wsl.exe', '--exec', 'bash', '-l', '-c', 'cd ~/SVH-OpsMan && exec claude' },
    }
  },
  -- New PowerShell tab
  { key = 'P', mods = 'LEADER',
    action = act.SpawnCommandInNewTab {
      label = 'pwsh',
      args  = { 'pwsh.exe' },
    }
  },
  -- New zsh tab (opens in OpsMan directory)
  { key = 'B', mods = 'LEADER',
    action = act.SpawnCommandInNewTab {
      label = 'zsh',
      args  = { 'wsl.exe', '--exec', 'bash', '-c', 'cd ~/SVH-OpsMan && exec zsh' },
    }
  },
  -- Rename current tab
  { key = 'r', mods = 'LEADER',
    action = act.PromptInputLine {
      description = 'Tab name (e.g. Claude/IR, pwsh/cluster):',
      action = wezterm.action_callback(function(window, _pane, line)
        if line and line ~= '' then window:active_tab():set_title(line) end
      end),
    }
  },

  -- ── Pane splits ───────────────────────────────────────────────────────────
  -- 2-way: current pane + one zsh pane below
  { key = '2', mods = 'LEADER',
    action = wezterm.action_callback(function(_window, pane)
      pane:split { direction = 'Bottom', args = { 'wsl.exe', '--exec', 'zsh' } }
    end)
  },
  -- 3-way: three equal horizontal bands
  { key = '3', mods = 'LEADER',
    action = wezterm.action_callback(function(_window, pane)
      local mid = pane:split { direction = 'Bottom', args = { 'wsl.exe', '--exec', 'zsh' } }
      mid:split { direction = 'Bottom', args = { 'wsl.exe', '--exec', 'zsh' } }
    end)
  },

  -- ── Pane navigation ───────────────────────────────────────────────────────
  { key = 'k',          mods = 'LEADER', action = act.ActivatePaneDirection 'Up'    },
  { key = 'j',          mods = 'LEADER', action = act.ActivatePaneDirection 'Down'  },
  { key = 'h',          mods = 'LEADER', action = act.ActivatePaneDirection 'Left'  },
  { key = 'l',          mods = 'LEADER', action = act.ActivatePaneDirection 'Right' },
  { key = 'UpArrow',    mods = 'LEADER', action = act.ActivatePaneDirection 'Up'    },
  { key = 'DownArrow',  mods = 'LEADER', action = act.ActivatePaneDirection 'Down'  },
  { key = 'LeftArrow',  mods = 'LEADER', action = act.ActivatePaneDirection 'Left'  },
  { key = 'RightArrow', mods = 'LEADER', action = act.ActivatePaneDirection 'Right' },

  -- ── Obsidian deep link ────────────────────────────────────────────────────
  -- Enter quick-select mode: highlights all obsidian:// URIs in scrollback.
  -- Select one with Enter to open it in Obsidian.
  { key = 'o', mods = 'LEADER',
    action = act.QuickSelectArgs {
      label    = 'open obsidian note',
      patterns = { [=[\bobsidian://[^\s'"<>)\]]+]=] },
      action   = wezterm.action_callback(function(window, pane)
        local uri = window:get_selection_text_for_pane(pane)
        if uri and uri ~= '' then wezterm.open_with(uri) end
      end),
    }
  },

  -- ── Misc ──────────────────────────────────────────────────────────────────
  -- Force status bar refresh without waiting for the 120s TTL
  { key = 'u', mods = 'LEADER',
    action = wezterm.action_callback(function(_window, _pane)
      _slow.ts = 0
    end)
  },
}

-- ── Mouse ─────────────────────────────────────────────────────────────────────
config.mouse_bindings = {
  -- Right-click pastes (common terminal convention)
  {
    event  = { Down = { streak = 1, button = 'Right' } },
    mods   = 'NONE',
    action = act.PasteFrom 'Clipboard',
  },
}

-- ── Default shell ─────────────────────────────────────────────────────────────
-- New tabs open a WSL zsh shell in OpsMan. Claude tabs are started via LEADER+C.
-- bash is used as a launcher only to cd first; exec zsh replaces it.
config.default_prog = { 'wsl.exe', '--exec', 'bash', '-c', 'cd ~/SVH-OpsMan && exec zsh' }

-- ── WSL domain ────────────────────────────────────────────────────────────────
-- Makes WSL panes show the Linux process name (not "wsl.exe") so tab colouring works.
config.wsl_domains = wezterm.default_wsl_domains()

return config

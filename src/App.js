import { useState, useMemo, useRef, useEffect } from "react";
import { PlusCircle, TrendingUp, TrendingDown, DollarSign, BarChart3, Upload, X,
         Trash2, ChevronLeft, ChevronRight, ArrowLeft, Receipt, Tag, Image } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, BarChart, Bar } from "recharts";

// ─── Storage (localStorage on desktop; window.storage fallback in Claude) ─────
const KEY = "tj_local_v2";
const hasLS = (() => { try { localStorage.setItem("_t","1"); localStorage.removeItem("_t"); return true; } catch { return false; } })();
async function persist(data) {
  const s = JSON.stringify(data);
  if (hasLS) { try { localStorage.setItem(KEY, s); } catch(e) { console.error(e); } }
  else if (window.storage) { try { await window.storage.set(KEY, s); } catch(e) { console.error(e); } }
}
async function restore() {
  if (hasLS) { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } }
  if (window.storage) { try { const r = await window.storage.get(KEY); return r ? JSON.parse(r.value) : null; } catch { return null; } }
  return null;
}

// ─── Conversion ───────────────────────────────────────────────────────────────
function fromDollar(d, mode, sym="MNQ") {
  const s=(sym||"").toUpperCase();
  if (mode==="ticks")  return d / (s.includes("MNQ")?0.5 : s.includes("NQ")?5 : 0.25);
  if (mode==="points") return d / (s.includes("MNQ")?2   : s.includes("NQ")?20: 1);
  return d;
}
function toDollar(v, mode, sym="MNQ") {
  const x=parseFloat(v)||0; const s=(sym||"").toUpperCase();
  if (mode==="ticks")  return x * (s.includes("MNQ")?0.5 : s.includes("NQ")?5 : 0.25);
  if (mode==="points") return x * (s.includes("MNQ")?2   : s.includes("NQ")?20: 1);
  return x;
}
const fmt=(d,mode,sym="MNQ")=>{
  const sign=d<0?"-":"";
  const a=Math.abs(d);
  if(mode==="dollars") return sign+"$"+a.toFixed(2);
  const v=Math.abs(fromDollar(d,mode,sym));
  return sign+v.toFixed(mode==="ticks"?1:2)+(mode==="ticks"?" tks":" pts");
};

function normDate(raw) {
  if (!raw) return new Date().toISOString().split("T")[0];
  const d = raw.trim().split(" ")[0].split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const m = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) { let [,mo,day,yr]=m; if(yr.length===2) yr="20"+yr;
    return yr+"-"+String(mo).padStart(2,"0")+"-"+String(day).padStart(2,"0"); }
  const p = new Date(d);
  return isNaN(p) ? new Date().toISOString().split("T")[0] : p.toISOString().split("T")[0];
}

// Futures session date: fills at/after 6:00 PM belong to the NEXT session day
function sessionDate(raw) {
  const d = normDate(raw);
  if (!raw) return d;
  const m = String(raw).match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!m) return d;
  let h = parseInt(m[1]);
  const ap = m[3];
  if (ap) {
    if (/pm/i.test(ap) && h !== 12) h += 12;
    if (/am/i.test(ap) && h === 12) h = 0;
  }
  if (h >= 18) {
    const dt = new Date(d + "T12:00:00");
    dt.setDate(dt.getDate() + 1);
    return dt.getFullYear() + "-" + String(dt.getMonth()+1).padStart(2,"0") + "-" + String(dt.getDate()).padStart(2,"0");
  }
  return d;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  bg:"#0a0e1a", panel:"#111827", panel2:"#0d1424", border:"#1e2a45",
  text:"#e8edf7", muted:"#5b6b8c", label:"#8b9cc0",
  blue:"#3b82f6", blueLt:"#60a5fa", green:"#34d399", red:"#f87171", orange:"#fbbf24", purple:"#a78bfa",
  inp:{ background:"#0d1424", border:"1px solid #24314f", color:"#e8edf7",
        borderRadius:"8px", padding:"8px 12px", fontSize:"13px",
        outline:"none", width:"100%", boxSizing:"border-box" }
};

const Btn=({onClick,color=S.blue,children,full,ghost})=>(
  <button onClick={onClick}
    style={{ display:"flex", alignItems:"center", gap:"5px", justifyContent:full?"center":"flex-start",
             padding:"7px 12px", background:ghost?"transparent":color,
             border:ghost?"1px solid "+S.border:"none", borderRadius:"8px",
             color:ghost?S.label:"#fff", fontSize:"12px", fontWeight:"500",
             cursor:"pointer", whiteSpace:"nowrap", width:full?"100%":"auto" }}>
    {children}
  </button>
);

const Field=({label,children})=>(
  <div style={{marginBottom:"10px"}}>
    {label&&<div style={{color:S.label,fontSize:"12px",marginBottom:"4px"}}>{label}</div>}
    {children}
  </div>
);

function Modal({title,onClose,children,wide}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",
                 alignItems:"center",justifyContent:"center",zIndex:50,padding:"16px"}}>
      <div style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"16px",
                   padding:"24px",width:"100%",maxWidth:wide?"580px":"440px",
                   maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
          <h2 style={{color:S.text,fontSize:"16px",fontWeight:"700",margin:0}}>{title}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",color:S.muted,cursor:"pointer",display:"flex"}}><X size={18}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const TagPill=({name,active,onClick,onRemove,small})=>(
  <span onClick={onClick}
    style={{ display:"inline-flex", alignItems:"center", gap:"4px",
             padding:small?"1px 7px":"4px 12px", borderRadius:"99px",
             fontSize:small?"10px":"12px", fontWeight:"600", cursor:onClick?"pointer":"default",
             background:active?S.blue:"#141d33",
             border:"1px solid "+(active?S.blue:"#2a3a5f"),
             color:active?"#fff":S.label, whiteSpace:"nowrap", userSelect:"none" }}>
    {name}
    {onRemove&&<X size={small?9:11} style={{cursor:"pointer"}} onClick={(e)=>{e.stopPropagation();onRemove();}}/>}
  </span>
);

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [trades, setTrades] = useState([]);
  const [tags, setTags] = useState([]);            // [{id,name}] user-created
  const [activeTags, setActiveTags] = useState([]); // toggled tag names on home
  const [expenses, setExpenses] = useState([]);
  const [expCats, setExpCats] = useState([]);
  const [imports, setImports] = useState([]);
  const [dayNotes, setDayNotes] = useState({});
  const [pnlMode, setPnlMode] = useState("ticks");
  const [view, setView] = useState("home");        // home | day | trade | stats | expenses | imports
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedTradeId, setSelectedTradeId] = useState(null);
  const [calMonth, setCalMonth] = useState(() => { const n=new Date(); return { y:n.getFullYear(), m:n.getMonth() }; });
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importStatus, setImportStatus] = useState("");
  const [combineMode, setCombineMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [exportData, setExportData] = useState(null); // {title, text}
  const [copied, setCopied] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newTrade, setNewTrade] = useState({ date:"", symbol:"MNQ", side:"long", entry:"", exit:"", shares:"", notes:"", screenshot:null, tags:[] });
  const [newExpense, setNewExpense] = useState({ date:"", description:"", category:"", amount:"", amountMode:"ticks", notes:"" });
  const fileRef = useRef(); const ssRef = useRef(); const ssRef2 = useRef();

  useEffect(() => {
    (async () => {
      const d = await restore();
      if (d) {
        setTrades(d.trades||[]); setTags(d.tags||[]); setExpenses(d.expenses||[]);
        setExpCats(d.expCats||[]); setImports(d.imports||[]); setDayNotes(d.dayNotes||{});
        setPnlMode(d.pnlMode||"ticks");
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    persist({ trades, tags, expenses, expCats, imports, dayNotes, pnlMode });
  }, [trades, tags, expenses, expCats, imports, dayNotes, pnlMode, loaded]);

  // ── Derived ──
  const filteredTrades = useMemo(() => {
    if (!activeTags.length) return trades;
    return trades.filter(t => activeTags.every(tag => (t.tags||[]).includes(tag)));
  }, [trades, activeTags]);

  const chronological = useMemo(() =>
    [...filteredTrades].sort((a,b)=>(b.date+(b.time||"")).localeCompare(a.date+(a.time||""))),
  [filteredTrades]);

  const dayMap = useMemo(() => {
    const m = {};
    filteredTrades.forEach(t => {
      if (!m[t.date]) m[t.date] = { pnl:0, n:0, trades:[] };
      m[t.date].pnl += t.pnl; m[t.date].n++; m[t.date].trades.push(t);
    });
    return m;
  }, [filteredTrades]);

  const stats = useMemo(() => {
    const src = filteredTrades;
    const W = src.filter(t=>t.pnl>0), L = src.filter(t=>t.pnl<0);
    const tot = src.reduce((s,t)=>s+t.pnl,0);
    const aw = W.length ? W.reduce((s,t)=>s+t.pnl,0)/W.length : 0;
    const al = L.length ? Math.abs(L.reduce((s,t)=>s+t.pnl,0)/L.length) : 0;
    const totalExp = expenses.reduce((s,e)=>s+e.amountDollars,0);
    return { tot, net:tot-totalExp, wins:W.length, losses:L.length,
             wr:src.length?(W.length/src.length*100).toFixed(1):0,
             aw, al, pf:al>0?(aw/al).toFixed(2):"N/A", n:src.length, totalExp };
  }, [filteredTrades, expenses]);

  const equity = useMemo(() => {
    let c=0;
    return [...filteredTrades].sort((a,b)=>(a.date+(a.time||"")).localeCompare(b.date+(b.time||"")))
      .map(t=>{ c+=t.pnl; return { d:t.date, v:parseFloat(c.toFixed(2)), pnl:t.pnl }; });
  }, [filteredTrades]);

  const expByCat = useMemo(() => {
    const m={}; expenses.forEach(e=>{ if(!m[e.category])m[e.category]=0; m[e.category]+=e.amountDollars; });
    return Object.keys(m).map(k=>({cat:k,dollars:m[k]})).sort((a,b)=>b.dollars-a.dollars);
  }, [expenses]);

  // ── CSV Parser ──
  const parseCSV = (text) => {
    const parseLine = (l) => {
      const r=[]; let cur="",inQ=false;
      for(let i=0;i<l.length;i++){ const c=l[i];
        if(c==='"'){ if(inQ&&l[i+1]==='"'){cur+='"';i++;} else inQ=!inQ; }
        else if(c===','&&!inQ){ r.push(cur.trim()); cur=""; }
        else cur+=c;
      }
      r.push(cur.trim()); return r;
    };
    let rows = text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(r=>r.trim());
    if (rows.length<2) throw new Error("No data rows");
    const hdrs = parseLine(rows[0]).map(h=>h.replace(/["']/g,"").trim().toLowerCase());
    const find = (keys) => { for(let i=0;i<hdrs.length;i++) for(const k of keys) if(hdrs[i].includes(k)) return i; return -1; };

    const si  = find(["symbol","instrument","ticker","contract"]);
    const di  = find(["date/time","date","time","datetime","timestamp"]);
    const xi  = find(["side","direction","action"]);
    const qi  = find(["quantity","qty","shares","size","volume","contracts"]);
    const pri = find(["price"]);
    const npi = find(["net p/l","net p&l","net pnl","net profit"]);
    const gpi = find(["gross p/l","gross p&l","gross pnl"]);
    const pi  = npi >= 0 ? npi : (gpi >= 0 ? gpi : find(["pnl","p&l","p/l","profit","realized","gain"]));
    const ei  = find(["entry","avg entry","open price","buy price"]);
    const x2i = find(["exit","avg exit","close price","sell price"]);

    const num = (v) => parseFloat(String(v||"").replace(/[$,()]/g,"")) || 0;
    const g = (vals, idx) => idx>=0 && idx<vals.length ? vals[idx] : "";
    let maxId = Math.max(...trades.map(t=>t.id), 0);
    const result = [];
    const isFillFormat = pri>=0 && pi>=0 && ei<0 && x2i<0;

    if (isFillFormat) {
      // Position-tracking pairing: accumulate signed fills per symbol;
      // when net position returns to flat, that's one complete round-trip trade.
      const fills = [];
      for (let i=1;i<rows.length;i++) {
        const v = parseLine(rows[i]).map(x=>x.replace(/["']/g,"").trim());
        if (v.every(x=>!x)) continue;
        const sym = g(v,si); if(!sym) continue;
        const dt = g(v,di);
        const sideRaw = g(v,xi).toLowerCase();
        const qty = Math.abs(num(g(v,qi))) || 1;
        fills.push({ symbol:sym.toUpperCase(), time:dt,
          signed: sideRaw.includes("sell")||sideRaw.includes("short") ? -qty : qty,
          price:num(g(v,pri)), pnl:num(g(v,pi)) });
      }
      fills.sort((a,b)=>new Date(a.time)-new Date(b.time));
      const pos = {}; // symbol -> { qty, fills:[] }
      for (const f of fills) {
        if (!pos[f.symbol]) pos[f.symbol] = { qty:0, fills:[] };
        const p = pos[f.symbol];
        p.fills.push(f);
        p.qty += f.signed;
        if (p.fills.length > 1 && p.qty === 0) {
          // Round trip complete
          const entryFill = p.fills[0];
          const exitFill  = f;
          const side = entryFill.signed < 0 ? "short" : "long";
          const netPnl = p.fills.reduce((s,x)=>s+x.pnl, 0); // Net P/L sum incl. all fees
          const qty = Math.max(...p.fills.map(x=>Math.abs(x.signed)));
          result.push({ id:++maxId,
            date: sessionDate(exitFill.time), time: exitFill.time, entryTime: entryFill.time,
            symbol: f.symbol, side,
            entry: entryFill.price, exit: exitFill.price, shares: qty,
            pnl: parseFloat(netPnl.toFixed(2)), notes:"", screenshot:null, tags:[] });
          p.fills = [];
        }
      }
    } else {
      for (let i=1;i<rows.length;i++) {
        const v = parseLine(rows[i]).map(x=>x.replace(/["']/g,"").trim());
        if (v.every(x=>!x)) continue;
        const sym = g(v,si); if(!sym) continue;
        const side = (g(v,xi).toLowerCase().includes("sell")||g(v,xi).toLowerCase().includes("short"))?"short":"long";
        const en=num(g(v,ei)), ex=num(g(v,x2i)), sh=Math.abs(num(g(v,qi)))||1;
        let pnl=num(g(v,pi));
        if(!pnl && en && ex) pnl = side==="long"?(ex-en)*sh:(en-ex)*sh;
        result.push({ id:++maxId, date:sessionDate(g(v,di)), time:g(v,di), symbol:sym.toUpperCase(),
          side, entry:en, exit:ex, shares:sh, pnl:parseFloat(pnl.toFixed(2)), notes:"", screenshot:null, tags:[] });
      }
    }
    return result;
  };

  const onFile = (e) => {
    const f=e.target.files[0]; if(!f) return;
    setImportStatus("Reading..."); setImportPreview(null);
    const r=new FileReader();
    r.onload=(ev)=>{
      try {
        const p=parseCSV(ev.target.result);
        if(!p.length){ setImportStatus("No completed trades found."); return; }
        setImportPreview({trades:p, name:f.name});
        setImportStatus("Found "+p.length+" trades totaling "+fmt(p.reduce((s,t)=>s+t.pnl,0),"dollars")+".");
      } catch(err){ setImportStatus("Error: "+err.message); }
    };
    r.onerror=()=>setImportStatus("Failed to read file.");
    r.readAsText(f); e.target.value="";
  };

  const confirmImport = () => {
    if(!importPreview) return;
    const impId = Date.now();
    setTrades(prev=>[...importPreview.trades.map(t=>({...t,importId:impId})),...prev]);
    setImports(prev=>[{id:impId,name:importPreview.name,date:new Date().toISOString().split("T")[0],count:importPreview.trades.length},...prev]);
    setImportPreview(null); setImportStatus(""); setModal(null);
  };

  const doDelete = () => {
    if(!deleteTarget) return;
    if(deleteTarget.type==="trade"){ setTrades(p=>p.filter(t=>t.id!==deleteTarget.id)); if(view==="trade")setView("home"); }
    if(deleteTarget.type==="expense") setExpenses(p=>p.filter(e=>e.id!==deleteTarget.id));
    if(deleteTarget.type==="import"){ setTrades(p=>p.filter(t=>t.importId!==deleteTarget.id)); setImports(p=>p.filter(i=>i.id!==deleteTarget.id)); }
    setDeleteTarget(null); setModal(null);
  };

  const addTrade = () => {
    if(!newTrade.symbol||!newTrade.entry||!newTrade.exit||!newTrade.shares){ alert("Fill Symbol, Entry, Exit, Qty"); return; }
    const en=parseFloat(newTrade.entry), ex=parseFloat(newTrade.exit), sh=parseFloat(newTrade.shares);
    const pnl=newTrade.side==="long"?(ex-en)*sh:(en-ex)*sh;
    setTrades(p=>[{ id:Math.max(...p.map(t=>t.id),0)+1,
      date:newTrade.date||selectedDay||new Date().toISOString().split("T")[0],
      symbol:newTrade.symbol.toUpperCase(), side:newTrade.side,
      entry:en, exit:ex, shares:sh, pnl:parseFloat(pnl.toFixed(2)),
      notes:newTrade.notes, screenshot:newTrade.screenshot, tags:newTrade.tags },...p]);
    setNewTrade({date:"",symbol:"MNQ",side:"long",entry:"",exit:"",shares:"",notes:"",screenshot:null,tags:[]});
    setModal(null);
  };

  const addExpense = () => {
    if(!newExpense.description||!newExpense.amount){ alert("Fill description and amount"); return; }
    if(!newExpense.category){ alert("Select or create a category"); return; }
    setExpenses(p=>[{ id:Date.now(), date:newExpense.date||new Date().toISOString().split("T")[0],
      description:newExpense.description, category:newExpense.category,
      amountDollars:toDollar(newExpense.amount,newExpense.amountMode,"MNQ"),
      amountRaw:parseFloat(newExpense.amount), amountMode:newExpense.amountMode,
      notes:newExpense.notes },...p]);
    setNewExpense({date:"",description:"",category:newExpense.category,amount:"",amountMode:"ticks",notes:""});
    setModal(null);
  };

  const updateTrade = (id, patch) => setTrades(p=>p.map(t=>t.id===id?{...t,...patch}:t));
  const toggleTradeTag = (id, tag) => setTrades(p=>p.map(t=>{
    if(t.id!==id) return t;
    const has=(t.tags||[]).includes(tag);
    return {...t, tags: has ? t.tags.filter(x=>x!==tag) : [...(t.tags||[]),tag] };
  }));

  // ── Calendar with week rows + weekly totals ──
  const monthName = new Date(calMonth.y, calMonth.m, 1).toLocaleString("default",{month:"long",year:"numeric"});
  const weeks = useMemo(() => {
    const fd = new Date(calMonth.y,calMonth.m,1).getDay();
    const total = new Date(calMonth.y,calMonth.m+1,0).getDate();
    const cells = [];
    for(let i=0;i<fd;i++) cells.push(null);
    for(let d=1;d<=total;d++) cells.push(d);
    while(cells.length%7!==0) cells.push(null);
    const w=[];
    for(let i=0;i<cells.length;i+=7) w.push(cells.slice(i,i+7));
    return w;
  }, [calMonth]);

  const dayKey = (day) => calMonth.y+"-"+String(calMonth.m+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
  const weekPnl = (week) => week.reduce((s,day)=>{ if(!day) return s; const dd=dayMap[dayKey(day)]; return s+(dd?dd.pnl:0); },0);
  const weekHasTrades = (week) => week.some(day=>day&&dayMap[dayKey(day)]);
  const monthPnl = useMemo(() => {
    const prefix = calMonth.y+"-"+String(calMonth.m+1).padStart(2,"0");
    return Object.keys(dayMap).filter(k=>k.startsWith(prefix)).reduce((s,k)=>s+dayMap[k].pnl,0);
  }, [dayMap, calMonth]);

  const openDay = (ds) => { setSelectedDay(ds); setView("day"); };
  const openTrade = (id) => { setSelectedTradeId(id); setView("trade"); };

  if (!loaded) return (
    <div style={{minHeight:"100vh",background:S.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
      <p style={{color:S.muted}}>Loading...</p>
    </div>
  );

  const dayData = selectedDay ? (dayMap[selectedDay] || { pnl:0, n:0, trades:[] }) : null;
  const selTrade = trades.find(t=>t.id===selectedTradeId);

  // ── Combine executions ──
  const combineSelected = () => {
    const sel = trades.filter(t=>selectedIds.includes(t.id));
    if (sel.length<2) { alert("Select at least 2 trades to combine"); return; }
    if (new Set(sel.map(t=>t.symbol)).size>1) { alert("Can only combine trades of the same symbol"); return; }
    const ts = t => { const d=new Date(t.time||t.date); return isNaN(d)?new Date(t.date):d; };
    const sorted = [...sel].sort((a,b)=>ts(a)-ts(b));
    const totQty = sel.reduce((s,t)=>s+(t.shares||1),0);
    const wEntry = sel.reduce((s,t)=>s+(t.entry||0)*(t.shares||1),0)/totQty;
    const wExit  = sel.reduce((s,t)=>s+(t.exit||0)*(t.shares||1),0)/totQty;
    const first = sorted[0], last = sorted[sorted.length-1];
    const merged = {
      id: Math.max(...trades.map(t=>t.id),0)+1,
      date: last.date, time: last.time, entryTime: first.entryTime||first.time,
      symbol: first.symbol, side: first.side,
      entry: parseFloat(wEntry.toFixed(2)), exit: parseFloat(wExit.toFixed(2)),
      shares: totQty,
      pnl: parseFloat(sel.reduce((s,t)=>s+t.pnl,0).toFixed(2)),
      notes: sel.map(t=>t.notes).filter(Boolean).join("\n"),
      screenshot: sel.map(t=>t.screenshot).find(Boolean)||null,
      tags: [...new Set(sel.flatMap(t=>t.tags||[]))],
      importId: first.importId,
    };
    setTrades(p=>[merged,...p.filter(t=>!selectedIds.includes(t.id))]);
    setSelectedIds([]); setCombineMode(false);
  };

  // ── Export helpers ──
  const download = (name, text) => {
    try {
      const b = new Blob([text], {type:"text/plain"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = name; a.click();
      URL.revokeObjectURL(a.href);
    } catch(e) { /* sandboxed environments block downloads — modal covers it */ }
  };
  const timePart = (s) => s ? String(s).split(" ").slice(1).join(" ") : "";
  const tradeText = (t) => [
    "═══ TRADE JOURNAL ═══",
    t.symbol+" "+t.side.toUpperCase()+" — "+(t.pnl>=0?"WIN":"LOSS"),
    "Date: "+t.date,
    "Entry: "+(t.entry||"—")+(t.entryTime?" @ "+timePart(t.entryTime):""),
    "Exit: "+(t.exit||"—")+(t.time?" @ "+timePart(t.time):""),
    "Qty: "+t.shares,
    "P&L: "+fmt(t.pnl,"dollars")+" ("+fmt(t.pnl,"ticks",t.symbol)+")",
    (t.tags||[]).length?"Tags: "+t.tags.join(", "):"",
    t.notes?"\nNotes:\n"+t.notes:"",
  ].filter(Boolean).join("\n");
  const exportTrade = (t) => {
    const text = tradeText(t);
    download(t.symbol+"_"+t.date+"_trade.txt", text);
    setCopied(false);
    setExportData({ title:"Export Trade — "+t.symbol+" "+t.date, text });
  };
  const exportDay = (ds) => {
    const dd = dayMap[ds] || {pnl:0,n:0,trades:[]};
    const text = [
      "═══ DAY JOURNAL — "+ds+" ═══",
      "Day P&L: "+fmt(dd.pnl,"dollars")+" ("+fmt(dd.pnl,"ticks")+")",
      "Trades: "+dd.n+" · Winners: "+dd.trades.filter(t=>t.pnl>0).length+" · Losers: "+dd.trades.filter(t=>t.pnl<0).length,
      dayNotes[ds]?"\nSession Notes:\n"+dayNotes[ds]:"",
      "\n─── Trades ───",
      ...dd.trades.map(t=>"\n"+tradeText(t)),
    ].filter(Boolean).join("\n");
    download("day_"+ds+".txt", text);
    setCopied(false);
    setExportData({ title:"Export Day — "+ds, text });
  };
  const copyExport = async () => {
    try { await navigator.clipboard.writeText(exportData.text); setCopied(true); }
    catch(e) { alert("Copy failed — select the text manually."); }
  };

  // Shared trade row renderer (TraderSync style)
  const TradeRow = ({t}) => {
    const isSel = selectedIds.includes(t.id);
    return (
    <div onClick={()=>combineMode
        ? setSelectedIds(p=>p.includes(t.id)?p.filter(x=>x!==t.id):[...p,t.id])
        : openTrade(t.id)}
      style={{ display:"grid",
               gridTemplateColumns:"64px 90px 70px 60px 1fr 1fr 50px 110px minmax(80px,1.2fr)",
               alignItems:"center", gap:"8px", padding:"10px 14px",
               borderTop:"1px solid "+S.border, cursor:"pointer",
               background:isSel?"#10233d":"transparent",
               outline:isSel?"1px solid "+S.blue:"none", outlineOffset:"-1px",
               transition:"background 0.1s" }}
      onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background="#141d33";}}
      onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background="transparent";}}>
      <span style={{ padding:"3px 0", borderRadius:"5px", fontSize:"10px", fontWeight:"800",
        textAlign:"center", letterSpacing:"0.5px",
        background:t.pnl>=0?"#0c2e1c":"#3b0d0d", color:t.pnl>=0?S.green:S.red }}>
        {t.pnl>=0?"WIN":"LOSS"}
      </span>
      <span style={{color:S.muted,fontSize:"12px"}}>{t.date.slice(5)}</span>
      <span style={{fontWeight:"600",fontSize:"13px"}}>{t.symbol}</span>
      <span style={{ fontSize:"10px", fontWeight:"700", textAlign:"center", padding:"3px 0", borderRadius:"5px",
        background:t.side==="long"?"#10233d":"#2d1230", color:t.side==="long"?S.blueLt:S.purple }}>
        {t.side.toUpperCase()}
      </span>
      <span style={{color:S.muted,fontSize:"12px"}}>{t.entry||"—"}</span>
      <span style={{color:S.muted,fontSize:"12px"}}>{t.exit||"—"}</span>
      <span style={{color:S.muted,fontSize:"12px"}}>{t.shares}</span>
      <span style={{fontWeight:"700",fontSize:"13px",color:t.pnl>=0?S.green:S.red}}>{fmt(t.pnl,pnlMode,t.symbol)}</span>
      <span style={{display:"flex",gap:"4px",flexWrap:"wrap",overflow:"hidden"}}>
        {(t.tags||[]).slice(0,2).map(tag=><TagPill key={tag} name={tag} small/>)}
        {(t.tags||[]).length>2&&<span style={{color:S.muted,fontSize:"10px"}}>+{t.tags.length-2}</span>}
      </span>
    </div>
    );
  };

  return (
    <div style={{minHeight:"100vh",background:S.bg,fontFamily:"system-ui,sans-serif",color:S.text}}>

      {/* Header */}
      <div style={{background:S.panel,borderBottom:"1px solid "+S.border,padding:"10px 16px"}}>
        <div style={{maxWidth:"1150px",margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
          <span style={{fontSize:"16px",fontWeight:"700"}}>Trading <span style={{color:S.blueLt}}>Journal</span></span>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap",alignItems:"center"}}>
            <div style={{display:"flex",background:S.panel2,borderRadius:"8px",padding:"2px",border:"1px solid "+S.border}}>
              {[["dollars","$"],["ticks","Ticks"],["points","Pts"]].map(([m,l])=>(
                <button key={m} onClick={()=>setPnlMode(m)}
                  style={{padding:"5px 10px",borderRadius:"6px",border:"none",cursor:"pointer",fontSize:"11px",fontWeight:"500",
                          background:pnlMode===m?S.blue:"transparent",color:pnlMode===m?"#fff":S.muted}}>{l}</button>
              ))}
            </div>
            <Btn onClick={()=>setModal("tags")} ghost><Tag size={13}/>Tags</Btn>
            <Btn onClick={()=>setModal("expCats")} ghost><Receipt size={13}/>Categories</Btn>
            <Btn onClick={()=>setModal("import")} color={S.blue}><Upload size={13}/>Import CSV</Btn>
            <Btn onClick={()=>setModal("add")} color="#1e40af"><PlusCircle size={13}/>Add Trade</Btn>
            <Btn onClick={()=>setModal("addExpense")} ghost><Receipt size={13}/>Expense</Btn>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{maxWidth:"1150px",margin:"0 auto",padding:"12px 16px 0"}}>
        <div style={{display:"flex",gap:"4px",borderBottom:"1px solid "+S.border,overflowX:"auto"}}>
          {[["home","Home"],["stats","Stats"],["expenses","Expenses ("+expenses.length+")"],["imports","Imports ("+imports.length+")"]].map(([k,l])=>(
            <button key={k} onClick={()=>setView(k)}
              style={{padding:"10px 16px",border:"none",background:"transparent",cursor:"pointer",fontSize:"13px",fontWeight:"500",
                      color:(view===k||((view==="day"||view==="trade")&&k==="home"))?S.blueLt:S.muted,
                      borderBottom:(view===k||((view==="day"||view==="trade")&&k==="home"))?"2px solid "+S.blue:"2px solid transparent",whiteSpace:"nowrap"}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:"1150px",margin:"0 auto",padding:"16px"}}>

        {/* ═══ HOME: tag filters + recent trades + calendar ═══ */}
        {view==="home"&&(
          <div>
            {/* Tag filter bar */}
            <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap",marginBottom:"14px"}}>
              <span style={{color:S.muted,fontSize:"12px",fontWeight:"600"}}>FILTER:</span>
              {tags.length===0
                ? <span style={{color:S.muted,fontSize:"12px"}}>No tags yet — create some via the Tags button (e.g., Negative Gamma, Positive Gamma, News Day)</span>
                : tags.map(tg=>(
                    <TagPill key={tg.id} name={tg.name} active={activeTags.includes(tg.name)}
                      onClick={()=>setActiveTags(p=>p.includes(tg.name)?p.filter(x=>x!==tg.name):[...p,tg.name])}/>
                  ))
              }
              {activeTags.length>0&&(
                <button onClick={()=>setActiveTags([])}
                  style={{background:"none",border:"none",color:S.blueLt,cursor:"pointer",fontSize:"12px"}}>Clear</button>
              )}
            </div>

            {/* Quick stats strip */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"10px",marginBottom:"16px"}}>
              {[
                ["Gross P&L", fmt(stats.tot,pnlMode), stats.tot>=0?S.green:S.red],
                ["Net P&L", fmt(stats.net,pnlMode), stats.net>=0?S.green:S.red],
                ["Win Rate", stats.wr+"%", S.blueLt],
                ["Trades", stats.n, S.text],
              ].map(([l,v,c])=>(
                <div key={l} style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",padding:"12px 14px"}}>
                  <div style={{color:S.muted,fontSize:"10px",textTransform:"uppercase",marginBottom:"3px"}}>{l}</div>
                  <div style={{color:c,fontSize:"17px",fontWeight:"700"}}>{v}</div>
                </div>
              ))}
            </div>

            {/* Recent trades — TraderSync style horizontal rows */}
            <div style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",overflow:"hidden",marginBottom:"18px"}}>
              <div style={{padding:"13px 16px",borderBottom:"1px solid "+S.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:"600",fontSize:"14px"}}>
                  {activeTags.length ? "Filtered Trades ("+chronological.length+")" : "Recent Trades"}
                </span>
                <span style={{color:S.muted,fontSize:"11px"}}>Click a row to journal it</span>
              </div>
              <div style={{overflowX:"auto"}}>
                <div style={{minWidth:"760px"}}>
                  {/* Column headers */}
                  <div style={{ display:"grid",
                       gridTemplateColumns:"64px 90px 70px 60px 1fr 1fr 50px 110px minmax(80px,1.2fr)",
                       gap:"8px", padding:"9px 14px", background:S.panel2 }}>
                    {["STATUS","DATE","SYMBOL","SIDE","ENTRY","EXIT","QTY","P&L","TAGS"].map(h=>(
                      <span key={h} style={{color:S.muted,fontSize:"10px",fontWeight:"700",letterSpacing:"0.5px"}}>{h}</span>
                    ))}
                  </div>
                  {chronological.length===0
                    ? <p style={{color:S.muted,textAlign:"center",padding:"32px 0",fontSize:"13px"}}>
                        {activeTags.length?"No trades match the selected tags":"No trades yet — import a CSV or add one manually"}
                      </p>
                    : (activeTags.length ? chronological : chronological.slice(0,10)).map(t=><TradeRow key={t.id} t={t}/>)
                  }
                </div>
              </div>
            </div>

            {/* Calendar with weekly totals column */}
            <div style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"16px",padding:"20px"}}>
              <div style={{textAlign:"center",marginBottom:"4px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"16px",marginBottom:"6px"}}>
                  <button onClick={()=>setCalMonth(p=>({y:p.m===0?p.y-1:p.y,m:p.m===0?11:p.m-1}))}
                    style={{background:S.panel2,border:"1px solid "+S.border,borderRadius:"8px",padding:"8px 12px",color:S.text,cursor:"pointer",display:"flex"}}>
                    <ChevronLeft size={16}/>
                  </button>
                  <span style={{fontSize:"17px",fontWeight:"700",minWidth:"140px"}}>{monthName}</span>
                  <button onClick={()=>setCalMonth(p=>({y:p.m===11?p.y+1:p.y,m:p.m===11?0:p.m+1}))}
                    style={{background:S.panel2,border:"1px solid "+S.border,borderRadius:"8px",padding:"8px 12px",color:S.text,cursor:"pointer",display:"flex"}}>
                    <ChevronRight size={16}/>
                  </button>
                </div>
                <div style={{fontSize:"12px",color:S.muted,marginBottom:"14px"}}>
                  Month P&L: <span style={{color:monthPnl>=0?S.green:S.red,fontWeight:"700"}}>{fmt(monthPnl,pnlMode)}</span>
                  {activeTags.length>0&&<span style={{marginLeft:"8px",color:S.blueLt}}>(filtered)</span>}
                </div>
              </div>

              {/* Header row: 7 days + WEEK column */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr) 86px",gap:"6px",marginBottom:"6px"}}>
                {["SUN","MON","TUE","WED","THU","FRI","SAT"].map(d=>(
                  <div key={d} style={{textAlign:"center",fontSize:"10px",fontWeight:"600",color:S.muted,
                    background:S.panel2,borderRadius:"6px",padding:"8px 0",letterSpacing:"0.5px"}}>{d}</div>
                ))}
                <div style={{textAlign:"center",fontSize:"10px",fontWeight:"700",color:S.blueLt,
                  background:"#10233d",borderRadius:"6px",padding:"8px 0",letterSpacing:"0.5px"}}>WEEK</div>
              </div>

              {/* Week rows */}
              {weeks.map((week,wi)=>{
                const wp = weekPnl(week);
                const has = weekHasTrades(week);
                return (
                  <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr) 86px",gap:"6px",marginBottom:"6px"}}>
                    {week.map((day,di)=>{
                      if(!day) return <div key={"e"+di} style={{background:S.panel2,borderRadius:"8px",opacity:0.35,minHeight:"62px"}}/>;
                      const ds=dayKey(day);
                      const dd=dayMap[ds];
                      const hasNote=!!dayNotes[ds];
                      return (
                        <button key={ds} onClick={()=>openDay(ds)}
                          style={{background:S.panel2,borderRadius:"8px",minHeight:"62px",padding:"6px 4px",cursor:"pointer",
                                  border:dd?(dd.pnl>=0?"1px solid #14532d":"1px solid #7f1d1d"):"1px solid transparent",
                                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"3px"}}>
                          <span style={{fontSize:"14px",fontWeight:"600"}}>{day}</span>
                          {dd&&(
                            <span style={{fontSize:"11px",fontWeight:"700",color:dd.pnl>=0?S.green:S.red,
                              overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%",whiteSpace:"nowrap"}}>
                              {fmt(dd.pnl,pnlMode)}
                            </span>
                          )}
                          {hasNote&&!dd&&<span style={{width:"4px",height:"4px",borderRadius:"50%",background:S.blueLt}}/>}
                        </button>
                      );
                    })}
                    {/* Weekly total box */}
                    <div style={{background:has?(wp>=0?"#0c2e1c":"#3b0d0d"):S.panel2,
                                 border:"1px solid "+(has?(wp>=0?"#14532d":"#7f1d1d"):S.border),
                                 borderRadius:"8px", minHeight:"62px",
                                 display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"2px",
                                 opacity:has?1:0.4}}>
                      <span style={{fontSize:"9px",color:S.muted,fontWeight:"600",letterSpacing:"0.5px"}}>WK {wi+1}</span>
                      <span style={{fontSize:"11px",fontWeight:"800",color:has?(wp>=0?S.green:S.red):S.muted,
                        overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%",whiteSpace:"nowrap",padding:"0 3px"}}>
                        {has?fmt(wp,pnlMode):"—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ TRADE JOURNAL VIEW ═══ */}
        {view==="trade"&&selTrade&&(
          <div>
            <button onClick={()=>setView("home")}
              style={{display:"flex",alignItems:"center",gap:"6px",background:"none",border:"none",
                      color:S.blueLt,cursor:"pointer",fontSize:"13px",marginBottom:"14px",padding:0}}>
              <ArrowLeft size={15}/>Back
            </button>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:"10px",marginBottom:"16px"}}>
              <div>
                <h2 style={{margin:"0 0 4px",fontSize:"18px",fontWeight:"700"}}>
                  {selTrade.symbol} <span style={{color:selTrade.side==="long"?S.blueLt:S.purple,fontSize:"14px"}}>{selTrade.side.toUpperCase()}</span>
                </h2>
                <span style={{color:S.muted,fontSize:"13px",display:"block"}}>{selTrade.date}</span>
                <span style={{color:S.muted,fontSize:"12px",display:"block",marginTop:"2px"}}>
                  {selTrade.entryTime?"Entry: "+timePart(selTrade.entryTime):""}
                  {selTrade.entryTime&&selTrade.time?" → ":""}
                  {selTrade.time?"Exit: "+timePart(selTrade.time):""}
                </span>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:"22px",fontWeight:"800",color:selTrade.pnl>=0?S.green:S.red}}>{fmt(selTrade.pnl,pnlMode,selTrade.symbol)}</div>
                <div style={{color:S.muted,fontSize:"12px"}}>{fmt(selTrade.pnl,"dollars")}</div>
              </div>
            </div>

            {/* Trade metrics */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:"10px",marginBottom:"16px"}}>
              {[["Entry",selTrade.entry||"—"],["Exit",selTrade.exit||"—"],["Qty",selTrade.shares],
                ["Result",selTrade.pnl>=0?"WIN":"LOSS"]].map(([l,v])=>(
                <div key={l} style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",padding:"12px 14px"}}>
                  <div style={{color:S.muted,fontSize:"10px",textTransform:"uppercase",marginBottom:"3px"}}>{l}</div>
                  <div style={{fontSize:"16px",fontWeight:"700",
                    color:l==="Result"?(selTrade.pnl>=0?S.green:S.red):S.text}}>{v}</div>
                </div>
              ))}
            </div>

            {/* Tags on this trade */}
            <div style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",padding:"16px",marginBottom:"14px"}}>
              <div style={{color:S.label,fontSize:"13px",fontWeight:"600",marginBottom:"10px"}}>Tags</div>
              {tags.length===0
                ? <p style={{color:S.muted,fontSize:"12px",margin:0}}>No tags created yet — use the Tags button in the header.</p>
                : <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                    {tags.map(tg=>(
                      <TagPill key={tg.id} name={tg.name}
                        active={(selTrade.tags||[]).includes(tg.name)}
                        onClick={()=>toggleTradeTag(selTrade.id, tg.name)}/>
                    ))}
                  </div>
              }
            </div>

            {/* Trade notes */}
            <div style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",padding:"16px",marginBottom:"14px"}}>
              <div style={{color:S.label,fontSize:"13px",fontWeight:"600",marginBottom:"8px"}}>Trade Journal</div>
              <textarea
                value={selTrade.notes||""}
                onChange={e=>updateTrade(selTrade.id,{notes:e.target.value})}
                placeholder="What was the setup? Gamma regime, structure, execution quality, what you'd do differently..."
                rows={5}
                style={{...S.inp,resize:"vertical",minHeight:"100px"}}/>
            </div>

            {/* Screenshot */}
            <div style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",padding:"16px",marginBottom:"14px"}}>
              <div style={{color:S.label,fontSize:"13px",fontWeight:"600",marginBottom:"10px"}}>Chart Screenshot</div>
              <div style={{display:"flex",alignItems:"center",gap:"12px",flexWrap:"wrap"}}>
                <button onClick={()=>ssRef2.current.click()}
                  style={{display:"flex",alignItems:"center",gap:"6px",padding:"8px 14px",background:S.panel2,
                          border:"1px solid "+S.border,borderRadius:"8px",color:S.label,cursor:"pointer",fontSize:"12px"}}>
                  <Image size={13}/>{selTrade.screenshot?"Replace":"Upload"}
                </button>
                <input ref={ssRef2} type="file" accept="image/*" style={{display:"none"}}
                  onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>updateTrade(selTrade.id,{screenshot:ev.target.result});r.readAsDataURL(f);}}/>
                {selTrade.screenshot&&(
                  <img src={selTrade.screenshot} alt="chart" onClick={()=>window.open(selTrade.screenshot)}
                    style={{maxHeight:"180px",maxWidth:"100%",borderRadius:"8px",border:"1px solid "+S.border,cursor:"pointer"}}/>
                )}
              </div>
            </div>

            <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
              <Btn onClick={()=>exportTrade(selTrade)} ghost><Upload size={13}/>Export Trade</Btn>
              <Btn onClick={()=>{setDeleteTarget({type:"trade",id:selTrade.id,label:selTrade.symbol+" "+selTrade.date});setModal("delete");}} color="#7f1d1d">
                <Trash2 size={13}/>Delete Trade
              </Btn>
            </div>
          </div>
        )}

        {/* ═══ DAY VIEW ═══ */}
        {view==="day"&&selectedDay&&(
          <div>
            <button onClick={()=>setView("home")}
              style={{display:"flex",alignItems:"center",gap:"6px",background:"none",border:"none",
                      color:S.blueLt,cursor:"pointer",fontSize:"13px",marginBottom:"14px",padding:0}}>
              <ArrowLeft size={15}/>Back to Home
            </button>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px",marginBottom:"14px"}}>
              <h2 style={{margin:0,fontSize:"18px",fontWeight:"700"}}>
                {new Date(selectedDay+"T00:00:00").toLocaleDateString("default",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}
              </h2>
              <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                <Btn onClick={()=>exportDay(selectedDay)} ghost><Upload size={13}/>Export Day</Btn>
                {combineMode
                  ? <>
                      <Btn onClick={combineSelected} color="#15803d">Merge ({selectedIds.length})</Btn>
                      <Btn onClick={()=>{setCombineMode(false);setSelectedIds([]);}} ghost>Cancel</Btn>
                    </>
                  : <Btn onClick={()=>{setCombineMode(true);setSelectedIds([]);}} ghost>Combine</Btn>
                }
                <Btn onClick={()=>{setNewTrade(p=>({...p,date:selectedDay}));setModal("add");}} color={S.blue}>
                  <PlusCircle size={13}/>Add Trade
                </Btn>
              </div>
            </div>
            {combineMode&&(
              <div style={{background:"#10233d",border:"1px solid #1e40af",borderRadius:"8px",padding:"10px 14px",marginBottom:"12px",fontSize:"12px",color:S.blueLt}}>
                Combine mode: tap trades to select them, then hit Merge. Merged trades get a size-weighted avg entry/exit, summed P&L, earliest entry time, and latest exit time.
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"10px",marginBottom:"16px"}}>
              {[["Day P&L",fmt(dayData.pnl,pnlMode),dayData.pnl>=0?S.green:S.red],
                ["Trades",dayData.n,S.blueLt],
                ["Winners",dayData.trades.filter(t=>t.pnl>0).length,S.green],
                ["Losers",dayData.trades.filter(t=>t.pnl<0).length,S.red]].map(([l,v,c])=>(
                <div key={l} style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",padding:"14px"}}>
                  <div style={{color:S.muted,fontSize:"10px",textTransform:"uppercase",marginBottom:"3px"}}>{l}</div>
                  <div style={{color:c,fontSize:"18px",fontWeight:"700"}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",padding:"16px",marginBottom:"16px"}}>
              <div style={{color:S.label,fontSize:"13px",fontWeight:"600",marginBottom:"8px"}}>Session Notes</div>
              <textarea value={dayNotes[selectedDay]||""}
                onChange={e=>setDayNotes(p=>({...p,[selectedDay]:e.target.value}))}
                placeholder="Session review — gamma regime, key levels, execution quality..."
                rows={4} style={{...S.inp,resize:"vertical",minHeight:"80px"}}/>
            </div>
            <div style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",overflow:"hidden"}}>
              <div style={{padding:"13px 16px",borderBottom:"1px solid "+S.border,fontWeight:"600",fontSize:"14px"}}>
                Trades ({dayData.n}) <span style={{color:S.muted,fontWeight:"400",fontSize:"11px",marginLeft:"6px"}}>Click a row to journal it</span>
              </div>
              <div style={{overflowX:"auto"}}>
                <div style={{minWidth:"760px"}}>
                  {dayData.n===0
                    ? <p style={{color:S.muted,textAlign:"center",padding:"28px 0",fontSize:"13px"}}>No trades on this day</p>
                    : dayData.trades.map(t=><TradeRow key={t.id} t={t}/>)
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STATS ═══ */}
        {view==="stats"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"10px",marginBottom:"16px"}}>
              {[["Gross P&L",fmt(stats.tot,pnlMode),stats.tot>=0?S.green:S.red,TrendingUp],
                ["Expenses",fmt(stats.totalExp,pnlMode),S.orange,Receipt],
                ["Net P&L",fmt(stats.net,pnlMode),stats.net>=0?S.green:S.red,DollarSign],
                ["Win Rate",stats.wr+"%",S.blueLt,BarChart3],
                ["Avg Win",fmt(stats.aw,pnlMode),S.green,TrendingUp],
                ["Avg Loss",fmt(stats.al,pnlMode),S.red,TrendingDown]].map(([l,v,c,Icon])=>(
                <div key={l} style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",padding:"14px",
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:S.muted,fontSize:"10px",textTransform:"uppercase",marginBottom:"3px"}}>{l}</div>
                    <div style={{color:c,fontSize:"17px",fontWeight:"700"}}>{v}</div>
                  </div>
                  <Icon size={20} color={c}/>
                </div>
              ))}
            </div>
            {activeTags.length>0&&(
              <div style={{background:"#10233d",border:"1px solid #1e40af",borderRadius:"8px",padding:"10px 14px",marginBottom:"14px",fontSize:"12px",color:S.blueLt}}>
                Stats filtered by: {activeTags.join(", ")}
              </div>
            )}
            <div style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",padding:"20px",marginBottom:"14px"}}>
              <div style={{fontWeight:"600",marginBottom:"12px"}}>Cumulative P&L</div>
              {equity.length<2
                ? <p style={{color:S.muted,textAlign:"center",padding:"32px 0"}}>Not enough trades</p>
                : <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={equity}>
                      <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                      <XAxis dataKey="d" tick={{fontSize:10,fill:S.muted}} tickLine={false}/>
                      <YAxis tick={{fontSize:10,fill:S.muted}} tickLine={false} axisLine={false} tickFormatter={v=>"$"+v}/>
                      <Tooltip contentStyle={{background:S.panel2,border:"1px solid "+S.border,borderRadius:"8px",color:S.text}} formatter={v=>["$"+v,"Cum. P&L"]}/>
                      <Line type="monotone" dataKey="v" stroke={S.blue} strokeWidth={2} dot={{r:3,fill:S.blue}}/>
                    </LineChart>
                  </ResponsiveContainer>
              }
            </div>
            <div style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",padding:"20px"}}>
              <div style={{fontWeight:"600",marginBottom:"12px"}}>P&L Per Trade</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={equity}>
                  <CartesianGrid strokeDasharray="3 3" stroke={S.border}/>
                  <XAxis dataKey="d" tick={{fontSize:9,fill:S.muted}} tickLine={false}/>
                  <YAxis tick={{fontSize:10,fill:S.muted}} tickLine={false} axisLine={false} tickFormatter={v=>"$"+v}/>
                  <Tooltip contentStyle={{background:S.panel2,border:"1px solid "+S.border,borderRadius:"8px",color:S.text}} formatter={v=>["$"+v,"P&L"]}/>
                  <Bar dataKey="pnl">{equity.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#10b981":"#ef4444"}/>)}</Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px",marginTop:"14px"}}>
                {[["Profit Factor",stats.pf],["Total Trades",stats.n],["W / L",stats.wins+" / "+stats.losses]].map(([l,v])=>(
                  <div key={l} style={{background:S.panel2,border:"1px solid "+S.border,borderRadius:"8px",padding:"12px"}}>
                    <div style={{color:S.muted,fontSize:"10px",textTransform:"uppercase"}}>{l}</div>
                    <div style={{fontSize:"18px",fontWeight:"700"}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ EXPENSES ═══ */}
        {view==="expenses"&&(
          <div style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",padding:"20px"}}>
            {expByCat.length>0&&(
              <>
                <div style={{fontWeight:"600",marginBottom:"10px"}}>By Category</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:"8px",marginBottom:"12px"}}>
                  {expByCat.map(({cat,dollars})=>(
                    <div key={cat} style={{background:S.panel2,border:"1px solid "+S.border,borderRadius:"8px",padding:"12px"}}>
                      <div style={{color:S.muted,fontSize:"11px",marginBottom:"4px"}}>{cat}</div>
                      <div style={{color:S.orange,fontSize:"15px",fontWeight:"700"}}>{fmt(dollars,pnlMode)}</div>
                    </div>
                  ))}
                </div>
                <div style={{background:"#1c1400",border:"1px solid #713f12",borderRadius:"8px",padding:"12px",
                  display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"18px"}}>
                  <span style={{color:"#fde68a",fontWeight:"600",fontSize:"13px"}}>Total Expenses</span>
                  <span style={{color:S.orange,fontWeight:"700",fontSize:"15px"}}>{fmt(stats.totalExp,pnlMode)}</span>
                </div>
              </>
            )}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
              <span style={{fontWeight:"600"}}>All Expenses</span>
              <Btn onClick={()=>setModal("addExpense")} color={S.blue}><PlusCircle size={13}/>Add</Btn>
            </div>
            {expenses.length===0
              ? <p style={{color:S.muted,textAlign:"center",padding:"28px 0",fontSize:"13px"}}>No expenses yet.</p>
              : <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:"13px"}}>
                    <thead><tr style={{background:S.panel2}}>
                      {["Date","Description","Category","Amount","Notes",""].map(h=>(
                        <th key={h||"x"} style={{padding:"9px 14px",textAlign:"left",color:S.muted,fontSize:"11px",fontWeight:"600",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {expenses.map(e=>(
                        <tr key={e.id} style={{borderTop:"1px solid "+S.border}}>
                          <td style={{padding:"9px 14px",color:S.muted}}>{e.date}</td>
                          <td style={{padding:"9px 14px",fontWeight:"500"}}>{e.description}</td>
                          <td style={{padding:"9px 14px"}}>
                            <span style={{background:"#1c1400",color:S.orange,borderRadius:"4px",padding:"2px 8px",fontSize:"11px",fontWeight:"600"}}>{e.category}</span>
                          </td>
                          <td style={{padding:"9px 14px",color:S.orange,fontWeight:"700"}}>{fmt(e.amountDollars,pnlMode)}</td>
                          <td style={{padding:"9px 14px",color:S.muted,maxWidth:"180px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.notes||"—"}</td>
                          <td style={{padding:"9px 14px"}}>
                            <button onClick={()=>{setDeleteTarget({type:"expense",id:e.id,label:e.description});setModal("delete");}}
                              style={{background:"none",border:"none",color:S.muted,cursor:"pointer",display:"flex"}}>
                              <Trash2 size={14}/>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        )}

        {/* ═══ IMPORTS ═══ */}
        {view==="imports"&&(
          <div style={{background:S.panel,border:"1px solid "+S.border,borderRadius:"12px",padding:"20px"}}>
            <div style={{fontWeight:"600",marginBottom:"12px"}}>Import History</div>
            {imports.length===0
              ? <p style={{color:S.muted,textAlign:"center",padding:"28px 0",fontSize:"13px"}}>No imports yet.</p>
              : imports.map(imp=>(
                  <div key={imp.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    border:"1px solid "+S.border,borderRadius:"8px",padding:"12px",marginBottom:"8px",background:S.panel2}}>
                    <div>
                      <div style={{fontSize:"13px",fontWeight:"500"}}>{imp.name}</div>
                      <div style={{color:S.muted,fontSize:"11px"}}>{imp.date} · {imp.count} trades</div>
                    </div>
                    <button onClick={()=>{setDeleteTarget({type:"import",id:imp.id,label:imp.name});setModal("delete");}}
                      style={{display:"flex",alignItems:"center",gap:"4px",background:"none",border:"none",color:S.muted,cursor:"pointer",fontSize:"12px"}}>
                      <Trash2 size={13}/>Delete
                    </button>
                  </div>
                ))
            }
          </div>
        )}
      </div>

      {/* ═══ MODALS ═══ */}

      {exportData&&(
        <Modal title={exportData.title} onClose={()=>setExportData(null)} wide>
          <textarea readOnly value={exportData.text}
            style={{...S.inp,resize:"vertical",minHeight:"260px",fontFamily:"monospace",fontSize:"12px",marginBottom:"12px"}}/>
          <div style={{display:"flex",gap:"10px"}}>
            <Btn onClick={copyExport} color={copied?"#15803d":S.blue} full>
              {copied?"Copied!":"Copy to Clipboard"}
            </Btn>
            <Btn onClick={()=>setExportData(null)} ghost full>Close</Btn>
          </div>
          <p style={{color:S.muted,fontSize:"11px",marginTop:"10px"}}>
            On desktop this also downloads as a .txt file automatically.
          </p>
        </Modal>
      )}

      {modal==="tags"&&(
        <Modal title="Custom Tags" onClose={()=>setModal(null)}>
          <p style={{color:S.muted,fontSize:"12px",marginBottom:"12px"}}>
            Create tags to label trades — e.g., Negative Gamma, Positive Gamma, News Day, A+ Setup, Revenge Trade.
            Then toggle them on the home screen to filter.
          </p>
          <div style={{display:"flex",gap:"8px",marginBottom:"16px"}}>
            <input type="text" value={newTag} onChange={e=>setNewTag(e.target.value)}
              placeholder="e.g., Negative Gamma" style={{...S.inp,flex:1}}
              onKeyDown={e=>{ if(e.key==="Enter"&&newTag.trim()&&!tags.some(t=>t.name.toLowerCase()===newTag.trim().toLowerCase())){setTags(p=>[...p,{id:Date.now(),name:newTag.trim()}]);setNewTag("");} }}/>
            <button onClick={()=>{ if(newTag.trim()&&!tags.some(t=>t.name.toLowerCase()===newTag.trim().toLowerCase())){setTags(p=>[...p,{id:Date.now(),name:newTag.trim()}]);setNewTag("");} }}
              style={{padding:"8px 16px",background:S.blue,border:"none",borderRadius:"8px",color:"#fff",cursor:"pointer",fontSize:"13px"}}>Add</button>
          </div>
          {tags.length===0
            ? <p style={{color:S.muted,fontSize:"13px",textAlign:"center",padding:"16px 0"}}>No tags yet.</p>
            : <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                {tags.map(t=>(
                  <TagPill key={t.id} name={t.name}
                    onRemove={()=>{
                      setTags(p=>p.filter(x=>x.id!==t.id));
                      setActiveTags(p=>p.filter(x=>x!==t.name));
                      setTrades(p=>p.map(tr=>({...tr,tags:(tr.tags||[]).filter(x=>x!==t.name)})));
                    }}/>
                ))}
              </div>
          }
        </Modal>
      )}

      {modal==="delete"&&deleteTarget&&(
        <Modal title="Confirm Delete" onClose={()=>setModal(null)}>
          <p style={{color:S.muted,fontSize:"13px",marginBottom:"6px"}}>
            {deleteTarget.type==="import"?"Delete import and all its trades?":deleteTarget.type==="expense"?"Delete this expense?":"Delete this trade?"}
          </p>
          <p style={{color:S.red,fontSize:"13px",fontWeight:"600",marginBottom:"20px"}}>{deleteTarget.label}</p>
          <div style={{display:"flex",gap:"10px"}}>
            <button onClick={()=>setModal(null)}
              style={{flex:1,padding:"8px",border:"1px solid "+S.border,background:"transparent",borderRadius:"8px",color:S.muted,cursor:"pointer",fontSize:"13px"}}>Cancel</button>
            <button onClick={doDelete}
              style={{flex:1,padding:"8px",background:"#dc2626",border:"none",borderRadius:"8px",color:"#fff",cursor:"pointer",fontSize:"13px",fontWeight:"600"}}>Delete</button>
          </div>
        </Modal>
      )}

      {modal==="import"&&(
        <Modal title="Import CSV" onClose={()=>{setModal(null);setImportPreview(null);setImportStatus("");}} wide>
          <div onClick={()=>fileRef.current.click()}
            style={{border:"2px dashed #24314f",borderRadius:"10px",padding:"32px",textAlign:"center",cursor:"pointer",marginBottom:"12px"}}>
            <Upload size={32} color={S.muted} style={{margin:"0 auto 8px"}}/>
            <p style={{color:S.blueLt,fontWeight:"500",fontSize:"14px"}}>Click to choose a CSV file</p>
            <p style={{color:S.muted,fontSize:"12px",marginTop:"4px"}}>Auto-detects Quantower fill exports & standard trade logs</p>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={onFile} style={{display:"none"}}/>
          </div>
          {importStatus&&(
            <div style={{padding:"10px 12px",borderRadius:"8px",fontSize:"13px",marginBottom:"12px",
              background:importStatus.startsWith("Error")?"#3b0d0d":importStatus.startsWith("Found")?"#0c1a4d":S.panel2,
              color:importStatus.startsWith("Error")?S.red:importStatus.startsWith("Found")?"#93c5fd":S.muted}}>
              {importStatus}
            </div>
          )}
          {importPreview&&(
            <>
              <p style={{color:S.label,fontSize:"12px",marginBottom:"8px"}}>Preview (first 3 of {importPreview.trades.length}):</p>
              <div style={{overflowX:"auto",borderRadius:"8px",border:"1px solid "+S.border,marginBottom:"12px"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                  <thead><tr style={{background:S.panel2}}>
                    {["Date","Sym","Side","Entry","Exit","Qty","Net P&L"].map(h=>(
                      <th key={h} style={{padding:"8px 10px",textAlign:"left",color:S.muted,fontWeight:"600"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {importPreview.trades.slice(0,3).map((t,i)=>(
                      <tr key={i} style={{borderTop:"1px solid "+S.border}}>
                        <td style={{padding:"7px 10px",color:S.muted}}>{t.date}</td>
                        <td style={{padding:"7px 10px"}}>{t.symbol}</td>
                        <td style={{padding:"7px 10px",color:t.side==="long"?S.green:S.red,fontWeight:"600"}}>{t.side}</td>
                        <td style={{padding:"7px 10px",color:S.muted}}>{t.entry||"—"}</td>
                        <td style={{padding:"7px 10px",color:S.muted}}>{t.exit||"—"}</td>
                        <td style={{padding:"7px 10px",color:S.muted}}>{t.shares}</td>
                        <td style={{padding:"7px 10px",color:t.pnl>=0?S.green:S.red,fontWeight:"600"}}>${t.pnl}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Btn onClick={confirmImport} color={S.blue} full>Confirm Import ({importPreview.trades.length} trades)</Btn>
            </>
          )}
        </Modal>
      )}

      {modal==="add"&&(
        <Modal title="Add Trade" onClose={()=>setModal(null)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
            <Field label="Date"><input type="date" value={newTrade.date} onChange={e=>setNewTrade({...newTrade,date:e.target.value})} style={S.inp}/></Field>
            <Field label="Symbol *"><input type="text" value={newTrade.symbol} onChange={e=>setNewTrade({...newTrade,symbol:e.target.value})} placeholder="MNQ" style={S.inp}/></Field>
          </div>
          <Field label="Side">
            <select value={newTrade.side} onChange={e=>setNewTrade({...newTrade,side:e.target.value})} style={S.inp}>
              <option value="long">Long</option><option value="short">Short</option>
            </select>
          </Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px"}}>
            <Field label="Entry *"><input type="number" step="0.25" value={newTrade.entry} onChange={e=>setNewTrade({...newTrade,entry:e.target.value})} style={S.inp}/></Field>
            <Field label="Exit *"><input type="number" step="0.25" value={newTrade.exit} onChange={e=>setNewTrade({...newTrade,exit:e.target.value})} style={S.inp}/></Field>
            <Field label="Qty *"><input type="number" value={newTrade.shares} onChange={e=>setNewTrade({...newTrade,shares:e.target.value})} style={S.inp}/></Field>
          </div>
          {tags.length>0&&(
            <Field label="Tags">
              <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                {tags.map(tg=>(
                  <TagPill key={tg.id} name={tg.name} active={newTrade.tags.includes(tg.name)}
                    onClick={()=>setNewTrade(p=>({...p,tags:p.tags.includes(tg.name)?p.tags.filter(x=>x!==tg.name):[...p.tags,tg.name]}))}/>
                ))}
              </div>
            </Field>
          )}
          <Field label="Notes">
            <textarea value={newTrade.notes} onChange={e=>setNewTrade({...newTrade,notes:e.target.value})} rows={2} style={{...S.inp,resize:"none"}}/>
          </Field>
          <Field label="Chart Screenshot">
            <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"14px"}}>
              <button onClick={()=>ssRef.current.click()}
                style={{display:"flex",alignItems:"center",gap:"6px",padding:"7px 12px",background:S.panel2,
                        border:"1px solid "+S.border,borderRadius:"8px",color:S.label,cursor:"pointer",fontSize:"12px"}}>
                <Image size={13}/>Upload
              </button>
              <input ref={ssRef} type="file" accept="image/*" style={{display:"none"}}
                onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setNewTrade(p=>({...p,screenshot:ev.target.result}));r.readAsDataURL(f);}}/>
              {newTrade.screenshot&&<img src={newTrade.screenshot} alt="ss" style={{height:"36px",width:"54px",objectFit:"cover",borderRadius:"4px",border:"1px solid "+S.border}}/>}
            </div>
          </Field>
          <Btn onClick={addTrade} color={S.blue} full>Add Trade</Btn>
        </Modal>
      )}

      {modal==="addExpense"&&(
        <Modal title="Add Expense" onClose={()=>setModal(null)}>
          {expCats.length===0&&(
            <div style={{background:"#1c1400",border:"1px solid #713f12",borderRadius:"8px",padding:"12px",marginBottom:"14px",fontSize:"13px",color:"#fde68a"}}>
              No categories yet. Close this and click <strong>Categories</strong> to create some first.
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
            <Field label="Date"><input type="date" value={newExpense.date} onChange={e=>setNewExpense({...newExpense,date:e.target.value})} style={S.inp}/></Field>
            <Field label="Category">
              <select value={newExpense.category} onChange={e=>setNewExpense({...newExpense,category:e.target.value})} style={S.inp}>
                <option value="">— Select —</option>
                {expCats.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description *">
            <input type="text" value={newExpense.description} onChange={e=>setNewExpense({...newExpense,description:e.target.value})}
              placeholder="e.g., Tradeify eval fee, car insurance" style={S.inp}/>
          </Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
            <Field label="Amount *"><input type="number" step="0.01" value={newExpense.amount} onChange={e=>setNewExpense({...newExpense,amount:e.target.value})} placeholder="0" style={S.inp}/></Field>
            <Field label="Amount In">
              <select value={newExpense.amountMode} onChange={e=>setNewExpense({...newExpense,amountMode:e.target.value})} style={S.inp}>
                <option value="dollars">Dollars ($)</option>
                <option value="ticks">Ticks (MNQ)</option>
                <option value="points">Points (MNQ)</option>
              </select>
            </Field>
          </div>
          {newExpense.amount&&(
            <div style={{background:S.panel2,borderRadius:"8px",padding:"10px 12px",marginBottom:"10px",fontSize:"12px",color:S.muted}}>
              = <span style={{color:S.orange,fontWeight:"600"}}>${toDollar(newExpense.amount,newExpense.amountMode,"MNQ").toFixed(2)} USD</span>
              &nbsp;·&nbsp;
              <span style={{color:S.orange}}>{fromDollar(toDollar(newExpense.amount,newExpense.amountMode,"MNQ"),"ticks","MNQ").toFixed(1)} ticks</span>
            </div>
          )}
          <Field label="Notes">
            <textarea value={newExpense.notes} onChange={e=>setNewExpense({...newExpense,notes:e.target.value})} rows={2} style={{...S.inp,resize:"none"}} placeholder="Optional"/>
          </Field>
          <Btn onClick={addExpense} color={S.blue} full>Add Expense</Btn>
        </Modal>
      )}

      {modal==="expCats"&&(
        <Modal title="Expense Categories" onClose={()=>setModal(null)}>
          <div style={{display:"flex",gap:"8px",marginBottom:"16px"}}>
            <input type="text" value={newCat} onChange={e=>setNewCat(e.target.value)}
              placeholder="e.g., Car Insurance" style={{...S.inp,flex:1}}
              onKeyDown={e=>{ if(e.key==="Enter"&&newCat.trim()&&!expCats.some(c=>c.name.toLowerCase()===newCat.toLowerCase())){setExpCats(p=>[...p,{id:Date.now(),name:newCat}]);setNewCat("");} }}/>
            <button onClick={()=>{ if(newCat.trim()&&!expCats.some(c=>c.name.toLowerCase()===newCat.toLowerCase())){setExpCats(p=>[...p,{id:Date.now(),name:newCat}]);setNewCat("");} }}
              style={{padding:"8px 16px",background:S.blue,border:"none",borderRadius:"8px",color:"#fff",cursor:"pointer",fontSize:"13px"}}>Add</button>
          </div>
          {expCats.length===0
            ? <p style={{color:S.muted,fontSize:"13px",textAlign:"center",padding:"16px 0"}}>No categories yet.</p>
            : expCats.map(c=>(
                <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  border:"1px solid "+S.border,borderRadius:"8px",padding:"10px 12px",marginBottom:"6px",background:S.panel2}}>
                  <span style={{fontSize:"13px",fontWeight:"500"}}>{c.name}</span>
                  <button onClick={()=>setExpCats(p=>p.filter(x=>x.id!==c.id))}
                    style={{background:"none",border:"none",color:S.muted,cursor:"pointer",display:"flex"}}>
                    <X size={15}/>
                  </button>
                </div>
              ))
          }
        </Modal>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const uid = () => Date.now() + Math.floor(Math.random() * 1000);

const stockColor = (item) => {
  if (item.stock <= 0) return "red";
  if (item.stock <= item.min) return "yellow";
  return "green";
};

const BADGE = {
  red:    { background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" },
  yellow: { background: "#fef9c3", color: "#854d0e", border: "1px solid #fde047" },
  green:  { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" },
  blue:   { background: "#dbeafe", color: "#1e40af", border: "1px solid #93c5fd" },
  gray:   { background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1" },
};

function Badge({ color = "gray", children }) {
  return <span style={{ ...BADGE[color], padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{children}</span>;
}

const s = {
  wrap: { fontFamily: "'Segoe UI',sans-serif", maxWidth: 560, margin: "0 auto", padding: "12px 10px", background: "#f8fafc", minHeight: "100vh" },
  card: { background: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  lbl:  { fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4, marginTop: 10 },
  inp:  { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" },
  btn:  (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: bg, color }),
  row:  { display: "flex", gap: 8, alignItems: "center" },
};

const TABS = ["📋 Jornada", "📦 Inventario", "🏭 Empresas", "📜 Historial"];

export default function App() {
  const [tab, setTab] = useState(0);
  const [empresas, setEmpresas] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar datos desde Supabase al iniciar
  useEffect(() => {
    fetchEmpresas();
    fetchJornadas();
  }, []);

  const fetchEmpresas = async () => {
    const { data } = await supabase.from("empresas").select("*").order("nombre");
    if (data) setEmpresas(data);
    setLoading(false);
  };

  const fetchJornadas = async () => {
    const { data } = await supabase.from("jornadas").select("*").order("created_at", { ascending: false });
    if (data) setReports(data);
  };

  // ── JORNADA STATE ──
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [supervisor, setSupervisor] = useState("");
  const [bloques, setBloques] = useState([]);
  const [obs, setObs] = useState("");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const addBloque = () => {
    if (!empresas.length) return;
    const emp = empresas[0];
    setBloques(prev => [...prev, { id: uid(), empresaId: emp.id, fuentes: [{ nombre: emp.fuentes[0] || "", mp: "", gases: "" }], insumos: {} }]);
  };
  const removeBloque = (bid) => setBloques(prev => prev.filter(b => b.id !== bid));
  const updateBloqueEmpresa = (bid, eId) => {
    const emp = empresas.find(e => e.id === eId);
    setBloques(prev => prev.map(b => b.id === bid ? { ...b, empresaId: eId, fuentes: [{ nombre: emp?.fuentes[0] || "", mp: "", gases: "" }], insumos: {} } : b));
  };
  const addFuente = (bid) => setBloques(prev => prev.map(b => b.id === bid ? { ...b, fuentes: [...b.fuentes, { nombre: "", mp: "", gases: "" }] } : b));
  const removeFuente = (bid, fi) => setBloques(prev => prev.map(b => b.id === bid ? { ...b, fuentes: b.fuentes.filter((_, i) => i !== fi) } : b));
  const updateFuente = (bid, fi, field, val) => setBloques(prev => prev.map(b => b.id === bid ? { ...b, fuentes: b.fuentes.map((f, i) => i === fi ? { ...f, [field]: val } : f) } : b));
  const updateInsumo = (bid, iid, val) => setBloques(prev => prev.map(b => b.id === bid ? { ...b, insumos: { ...b.insumos, [iid]: val } } : b));

  const handleRegistrar = async () => {
    if (!supervisor || !bloques.length || bloques.some(b => b.fuentes.some(f => !f.nombre))) {
      setErr("Completa supervisor y nombre de cada fuente."); return;
    }
    setErr(""); setSaving(true);

    // Descontar inventario en Supabase
    for (const bloque of bloques) {
      const emp = empresas.find(e => e.id === bloque.empresaId);
      if (!emp) continue;
      const newInsumos = emp.insumos.map(ins => {
        const usado = parseInt(bloque.insumos[ins.id]) || 0;
        return { ...ins, stock: Math.max(0, ins.stock - usado) };
      });
      await supabase.from("empresas").update({ insumos: newInsumos }).eq("id", emp.id);
    }

    // Guardar jornada
    const bloquesGuardar = bloques.map(b => ({
      ...b,
      empresaNombre: empresas.find(e => e.id === b.empresaId)?.nombre
    }));
    await supabase.from("jornadas").insert({ fecha, supervisor, bloques: bloquesGuardar, obs });

    // Recargar datos
    await fetchEmpresas();
    await fetchJornadas();

    // Generar mensaje WhatsApp
    const updatedEmpresas = await supabase.from("empresas").select("*");
    const empData = updatedEmpresas.data || [];
    const d = new Date(fecha + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    let m = `📊 *INFORME DIARIO DE JORNADA*\n📅 ${d}\n👷 Supervisor: ${supervisor}\n`;
    bloques.forEach(bloque => {
      const emp = empData.find(e => e.id === bloque.empresaId);
      m += `\n🏭 *${emp?.nombre}*\n`;
      bloque.fuentes.forEach(f => {
        m += `  ▪️ ${f.nombre}`;
        if (f.mp) m += ` | MP: ${f.mp} corrida${f.mp > 1 ? "s" : ""}`;
        if (f.gases) m += ` | Gases: ${f.gases} med.`;
        m += "\n";
      });
      const usadosArr = emp?.insumos.filter(i => parseInt(bloque.insumos[i.id]) > 0) || [];
      if (usadosArr.length) {
        m += `  🧪 Insumos:\n`;
        usadosArr.forEach(i => { m += `    • ${i.name}: ${bloque.insumos[i.id]} ${i.unit}\n`; });
      }
      const alertas = emp?.insumos.filter(i => i.stock <= i.min) || [];
      if (alertas.length) m += `  ⚠️ Stock bajo: ${alertas.map(i => `${i.name} (${i.stock} ${i.unit})`).join(", ")}\n`;
    });
    if (obs) m += `\n📝 ${obs}`;
    setMsg(m);
    setSupervisor(""); setBloques([]); setObs("");
    setSaving(false);
  };

  const copyMsg = () => { navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  // ── INVENTARIO STATE ──
  const [invEmpId, setInvEmpId] = useState(null);
  const [repoMap, setRepoMap] = useState({});
  const [newIns, setNewIns] = useState({ name: "", stock: "", unit: "un", min: "" });
  const [invMsg, setInvMsg] = useState("");

  const invEmp = empresas.find(e => e.id === (invEmpId ?? empresas[0]?.id));

  const reponer = async (iid) => {
    const cant = parseInt(repoMap[iid]) || 0; if (!cant) return;
    const newInsumos = invEmp.insumos.map(i => i.id === iid ? { ...i, stock: i.stock + cant } : i);
    await supabase.from("empresas").update({ insumos: newInsumos }).eq("id", invEmp.id);
    setRepoMap(p => ({ ...p, [iid]: "" }));
    await fetchEmpresas();
    setInvMsg("✅ Stock repuesto."); setTimeout(() => setInvMsg(""), 2000);
  };

  const removeIns = async (iid) => {
    const newInsumos = invEmp.insumos.filter(i => i.id !== iid);
    await supabase.from("empresas").update({ insumos: newInsumos }).eq("id", invEmp.id);
    await fetchEmpresas();
  };

  const addIns = async () => {
    if (!newIns.name || newIns.stock === "") return;
    const ins = { id: uid(), name: newIns.name, stock: parseInt(newIns.stock), unit: newIns.unit, min: parseInt(newIns.min) || 0 };
    const newInsumos = [...invEmp.insumos, ins];
    await supabase.from("empresas").update({ insumos: newInsumos }).eq("id", invEmp.id);
    setNewIns({ name: "", stock: "", unit: "un", min: "" });
    await fetchEmpresas();
    setInvMsg("✅ Insumo agregado."); setTimeout(() => setInvMsg(""), 2000);
  };

  // ── EMPRESAS STATE ──
  const [newEmp, setNewEmp] = useState({ nombre: "" });
  const [newFuente, setNewFuente] = useState({});
  const [empMsg, setEmpMsg] = useState("");

  const addEmpresa = async () => {
    if (!newEmp.nombre) return;
    await supabase.from("empresas").insert({ nombre: newEmp.nombre, fuentes: [], insumos: [] });
    setNewEmp({ nombre: "" });
    await fetchEmpresas();
    setEmpMsg("✅ Empresa agregada."); setTimeout(() => setEmpMsg(""), 2000);
  };

  const removeEmpresa = async (id) => {
    await supabase.from("empresas").delete().eq("id", id);
    await fetchEmpresas();
  };

  const addFuenteEmp = async (emp) => {
    const n = newFuente[emp.id]; if (!n) return;
    await supabase.from("empresas").update({ fuentes: [...emp.fuentes, n] }).eq("id", emp.id);
    setNewFuente(p => ({ ...p, [emp.id]: "" }));
    await fetchEmpresas();
  };

  const removeFuenteEmp = async (emp, fi) => {
    await supabase.from("empresas").update({ fuentes: emp.fuentes.filter((_, i) => i !== fi) }).eq("id", emp.id);
    await fetchEmpresas();
  };

  if (loading) return (
    <div style={{ ...s.wrap, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "#64748b" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🌿</div>
        <div>Cargando datos...</div>
      </div>
    </div>
  );

  return (
    <div style={s.wrap}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: "#1e293b" }}>🌿 Monitoreo Ambiental</h2>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>Informe Diario + Inventario por Empresa</p>
      </div>

      <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)} style={{ ...s.btn(tab === i ? "#0ea5e9" : "#e2e8f0", tab === i ? "#fff" : "#475569"), flex: 1, fontSize: 11, padding: "8px 2px" }}>{t}</button>
        ))}
      </div>

      {/* ── TAB 0: JORNADA ── */}
      {tab === 0 && (
        <div>
          <div style={s.card}>
            <label style={s.lbl}>Fecha</label>
            <input style={s.inp} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            <label style={s.lbl}>Supervisor</label>
            <input style={s.inp} placeholder="Nombre del supervisor" value={supervisor} onChange={e => setSupervisor(e.target.value)} />
          </div>

          {bloques.map((bloque, bi) => {
            const emp = empresas.find(e => e.id === bloque.empresaId);
            return (
              <div key={bloque.id} style={{ ...s.card, border: "1px solid #bfdbfe" }}>
                <div style={{ ...s.row, justifyContent: "space-between", marginBottom: 8 }}>
                  <strong style={{ fontSize: 14, color: "#1e40af" }}>🏭 Empresa {bi + 1}</strong>
                  <button onClick={() => removeBloque(bloque.id)} style={s.btn("#fee2e2", "#dc2626")}>✕ Quitar</button>
                </div>
                <label style={s.lbl}>Empresa</label>
                <select style={s.inp} value={bloque.empresaId} onChange={e => updateBloqueEmpresa(bloque.id, parseInt(e.target.value))}>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>

                <div style={{ ...s.row, justifyContent: "space-between", marginTop: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Fuentes</span>
                  <button onClick={() => addFuente(bloque.id)} style={s.btn("#f0f9ff", "#0ea5e9")}>+ Fuente</button>
                </div>
                {bloque.fuentes.map((f, fi) => (
                  <div key={fi} style={{ background: "#f8fafc", borderRadius: 8, padding: 10, marginTop: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ ...s.row, justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Fuente {fi + 1}</span>
                      {bloque.fuentes.length > 1 && <button onClick={() => removeFuente(bloque.id, fi)} style={{ ...s.btn("#fee2e2", "#dc2626"), padding: "2px 8px" }}>✕</button>}
                    </div>
                    <label style={s.lbl}>Nombre / ID</label>
                    {emp?.fuentes.length > 0
                      ? <select style={s.inp} value={f.nombre} onChange={e => updateFuente(bloque.id, fi, "nombre", e.target.value)}>
                          <option value="">— Seleccionar —</option>
                          {emp.fuentes.map((fn, i) => <option key={i} value={fn}>{fn}</option>)}
                          <option value="__otro__">Otra (escribir)</option>
                        </select>
                      : null}
                    {(f.nombre === "__otro__" || !emp?.fuentes.length) &&
                      <input style={{ ...s.inp, marginTop: 4 }} placeholder="Nombre de la fuente" onChange={e => updateFuente(bloque.id, fi, "nombre", e.target.value)} />}
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <div style={{ flex: 1 }}><label style={{ ...s.lbl, marginTop: 0 }}>Corridas MP</label><input style={s.inp} type="number" min="0" placeholder="0" value={f.mp} onChange={e => updateFuente(bloque.id, fi, "mp", e.target.value)} /></div>
                      <div style={{ flex: 1 }}><label style={{ ...s.lbl, marginTop: 0 }}>Med. Gases</label><input style={s.inp} type="number" min="0" placeholder="0" value={f.gases} onChange={e => updateFuente(bloque.id, fi, "gases", e.target.value)} /></div>
                    </div>
                  </div>
                ))}

                {emp?.insumos.length > 0 && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginTop: 12 }}>🧪 Insumos utilizados</div>
                    {emp.insumos.map(ins => (
                      <div key={ins.id} style={{ ...s.row, marginTop: 6 }}>
                        <span style={{ flex: 1, fontSize: 13 }}>{ins.name}</span>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{ins.stock} {ins.unit}</span>
                        <input style={{ ...s.inp, width: 60, textAlign: "center" }} type="number" min="0" placeholder="0" value={bloque.insumos[ins.id] || ""} onChange={e => updateInsumo(bloque.id, ins.id, e.target.value)} />
                        <span style={{ fontSize: 12, color: "#94a3b8", minWidth: 24 }}>{ins.unit}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}

          <button onClick={addBloque} style={{ ...s.btn("#f0f9ff", "#0ea5e9"), width: "100%", marginBottom: 12, padding: 10 }}>+ Agregar empresa a la jornada</button>

          <div style={s.card}>
            <label style={s.lbl}>📝 Observaciones</label>
            <textarea style={{ ...s.inp, minHeight: 60, resize: "vertical" }} placeholder="Incidencias, condiciones del día..." value={obs} onChange={e => setObs(e.target.value)} />
          </div>

          {err && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>{err}</p>}
          <button onClick={handleRegistrar} disabled={saving} style={{ ...s.btn(saving ? "#94a3b8" : "#0ea5e9"), width: "100%", padding: 12, fontSize: 15 }}>
            {saving ? "⏳ Guardando..." : "✅ Registrar jornada y generar informe"}
          </button>

          {msg && (
            <div style={{ ...s.card, marginTop: 14, background: "#f0fdf4", border: "1px solid #86efac" }}>
              <div style={{ ...s.row, justifyContent: "space-between", marginBottom: 8 }}>
                <strong style={{ fontSize: 14, color: "#166534" }}>💬 Mensaje para WhatsApp</strong>
                <button onClick={copyMsg} style={s.btn(copied ? "#166534" : "#16a34a")}>{copied ? "✓ Copiado" : "Copiar"}</button>
              </div>
              <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "#1e293b", margin: 0, lineHeight: 1.6 }}>{msg}</pre>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 1: INVENTARIO ── */}
      {tab === 1 && (
        <div>
          <div style={s.card}>
            <label style={s.lbl}>Empresa</label>
            <select style={s.inp} value={invEmp?.id} onChange={e => setInvEmpId(parseInt(e.target.value))}>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>

          {invMsg && <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 13, color: "#166534" }}>{invMsg}</div>}

          {invEmp?.insumos.map(item => {
            const color = stockColor(item);
            return (
              <div key={item.id} style={{ ...s.card, border: color === "red" ? "1px solid #fca5a5" : color === "yellow" ? "1px solid #fde047" : "1px solid #e2e8f0" }}>
                <div style={{ ...s.row, justifyContent: "space-between" }}>
                  <div style={{ ...s.row, gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</span>
                    <Badge color={color}>{item.stock} {item.unit}</Badge>
                    {color === "red" && <Badge color="red">⚠️ Sin stock</Badge>}
                    {color === "yellow" && <Badge color="yellow">⚠️ Stock bajo</Badge>}
                  </div>
                  <button onClick={() => removeIns(item.id)} style={{ ...s.btn("#fee2e2", "#dc2626"), padding: "3px 8px" }}>✕</button>
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Mínimo: {item.min} {item.unit}</div>
                <div style={{ ...s.row, marginTop: 8 }}>
                  <input style={{ ...s.inp, flex: 1 }} type="number" min="1" placeholder="Cantidad a reponer" value={repoMap[item.id] || ""} onChange={e => setRepoMap(p => ({ ...p, [item.id]: e.target.value }))} />
                  <button onClick={() => reponer(item.id)} style={s.btn("#0ea5e9")}>+ Reponer</button>
                </div>
              </div>
            );
          })}

          <div style={{ ...s.card, border: "1px dashed #94a3b8" }}>
            <strong style={{ fontSize: 14 }}>➕ Nuevo insumo para {invEmp?.nombre}</strong>
            <label style={s.lbl}>Nombre</label>
            <input style={s.inp} placeholder="Ej: Cinta PTFE" value={newIns.name} onChange={e => setNewIns(p => ({ ...p, name: e.target.value }))} />
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><label style={s.lbl}>Stock inicial</label><input style={s.inp} type="number" min="0" value={newIns.stock} onChange={e => setNewIns(p => ({ ...p, stock: e.target.value }))} /></div>
              <div style={{ flex: 1 }}><label style={s.lbl}>Unidad</label><input style={s.inp} placeholder="un / L / par" value={newIns.unit} onChange={e => setNewIns(p => ({ ...p, unit: e.target.value }))} /></div>
              <div style={{ flex: 1 }}><label style={s.lbl}>Mín. alerta</label><input style={s.inp} type="number" min="0" value={newIns.min} onChange={e => setNewIns(p => ({ ...p, min: e.target.value }))} /></div>
            </div>
            <button onClick={addIns} style={{ ...s.btn("#0ea5e9"), width: "100%", marginTop: 10, padding: 10 }}>Agregar insumo</button>
          </div>
        </div>
      )}

      {/* ── TAB 2: EMPRESAS ── */}
      {tab === 2 && (
        <div>
          {empMsg && <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 13, color: "#166534" }}>{empMsg}</div>}

          {empresas.map(emp => (
            <div key={emp.id} style={s.card}>
              <div style={{ ...s.row, justifyContent: "space-between" }}>
                <strong style={{ fontSize: 15 }}>🏭 {emp.nombre}</strong>
                <button onClick={() => removeEmpresa(emp.id)} style={{ ...s.btn("#fee2e2", "#dc2626"), padding: "3px 8px" }}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Fuentes registradas:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {emp.fuentes.map((f, i) => (
                  <div key={i} style={{ ...s.row, background: "#f1f5f9", borderRadius: 6, padding: "3px 8px", fontSize: 12 }}>
                    {f}
                    <button onClick={() => removeFuenteEmp(emp, i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: "0 0 0 4px", fontSize: 12 }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ ...s.row, marginTop: 8 }}>
                <input style={{ ...s.inp, flex: 1 }} placeholder="Nueva fuente..." value={newFuente[emp.id] || ""} onChange={e => setNewFuente(p => ({ ...p, [emp.id]: e.target.value }))} />
                <button onClick={() => addFuenteEmp(emp)} style={s.btn("#0ea5e9")}>+ Agregar</button>
              </div>
            </div>
          ))}

          <div style={{ ...s.card, border: "1px dashed #94a3b8" }}>
            <strong style={{ fontSize: 14 }}>➕ Nueva empresa</strong>
            <label style={s.lbl}>Nombre</label>
            <input style={s.inp} placeholder="Ej: Minera Escondida" value={newEmp.nombre} onChange={e => setNewEmp({ nombre: e.target.value })} />
            <button onClick={addEmpresa} style={{ ...s.btn("#0ea5e9"), width: "100%", marginTop: 10, padding: 10 }}>Agregar empresa</button>
          </div>
        </div>
      )}

      {/* ── TAB 3: HISTORIAL ── */}
      {tab === 3 && (
        <div>
          {reports.length === 0 && <div style={{ ...s.card, color: "#94a3b8", textAlign: "center" }}>No hay jornadas registradas aún.</div>}
          {reports.map(r => (
            <div key={r.id} style={s.card}>
              <div style={{ ...s.row, justifyContent: "space-between" }}>
                <strong style={{ fontSize: 14 }}>👷 {r.supervisor}</strong>
                <Badge color="blue">{new Date(r.fecha + "T12:00:00").toLocaleDateString("es-CL")}</Badge>
              </div>
              {r.bloques?.map((b, i) => (
                <div key={i} style={{ marginTop: 8, background: "#f8fafc", borderRadius: 8, padding: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#1e40af" }}>🏭 {b.empresaNombre}</div>
                  {b.fuentes?.map((f, fi) => (
                    <div key={fi} style={{ fontSize: 12, color: "#475569" }}>▪️ {f.nombre}{f.mp ? ` | MP: ${f.mp}` : ""}{f.gases ? ` | Gases: ${f.gases}` : ""}</div>
                  ))}
                </div>
              ))}
              {r.obs && <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>📝 {r.obs}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState } from "react";
import "./App.css";

import {
  LayoutDashboard,
  FileText,
  Users,
  BrainCircuit,
  Bell,
  BarChart3,
  Settings,
  LogOut,
  Search,
  Plus,
  Clock,
  CheckCircle,
  AlertTriangle,
  Menu,
  X,
  Building2
} from "lucide-react";

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
} from "chart.js";

import { Doughnut, Bar } from "react-chartjs-2";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
);

function App() {

  const [pagina, setPagina] = useState("Dashboard");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const [busqueda, setBusqueda] = useState("");

  const [tramites, setTramites] = useState([]);

  const [formulario, setFormulario] = useState({
    ciudadano: "",
    correo: "",
    tipo: "",
    area: "",
    descripcion: ""
  });

  const menu = [
    { nombre: "Dashboard", icono: LayoutDashboard },
    { nombre: "Gestión de trámites", icono: FileText },
    { nombre: "Ciudadanos", icono: Users },
    { nombre: "Machine Learning", icono: BrainCircuit },
    { nombre: "Notificaciones", icono: Bell },
    { nombre: "Reportes", icono: BarChart3 },
    { nombre: "Configuración", icono: Settings }
  ];

  const cambiarPagina = (nombre) => {
    setPagina(nombre);
    setMenuAbierto(false);
    setMostrarFormulario(false);
  };

  const registrarTramite = (e) => {
    e.preventDefault();

    const nuevo = {
      ...formulario,
      id: Date.now(),
      codigo: `TRM-${Date.now().toString().slice(-6)}`,
      fecha: new Date().toLocaleDateString("es-PE"),
      estado: "Registrado",
      prioridad: "Pendiente de análisis"
    };

    setTramites([...tramites, nuevo]);

    setFormulario({
      ciudadano: "",
      correo: "",
      tipo: "",
      area: "",
      descripcion: ""
    });

    setMostrarFormulario(false);

    alert("Trámite registrado correctamente");
  };

  const pendientes = tramites.filter(
    t => t.estado !== "Finalizado"
  ).length;

  const finalizados = tramites.filter(
    t => t.estado === "Finalizado"
  ).length;

  const filtrados = tramites.filter(t =>
    `${t.codigo} ${t.ciudadano} ${t.tipo}`
      .toLowerCase()
      .includes(busqueda.toLowerCase())
  );

  const datosDona = {
    labels: ["Pendientes", "Finalizados"],
    datasets: [{
      data: [pendientes, finalizados],
      backgroundColor: ["#F59E0B", "#10B981"],
      borderWidth: 0
    }]
  };

  const datosBarras = {
    labels: ["Administración", "Obras Públicas", "Desarrollo Urbano",
      "Registro Civil", "Mesa de Partes"],
    datasets: [{
      label: "Trámites registrados",
      data: [
        tramites.filter(t => t.area === "Administración").length,
        tramites.filter(t => t.area === "Obras Públicas").length,
        tramites.filter(t => t.area === "Desarrollo Urbano").length,
        tramites.filter(t => t.area === "Registro Civil").length,
        tramites.filter(t => t.area === "Mesa de Partes").length
      ],
      backgroundColor: "#2563EB",
      borderRadius: 7
    }]
  };

  const renderContenido = () => {

    switch (pagina) {

      case "Gestión de trámites":
        return (
          <>
            <div className="section-heading">
              <div>
                <h2>Gestión de trámites</h2>
                <p>Administra los expedientes municipales.</p>
              </div>

              <button className="primary-btn"
                onClick={() => setMostrarFormulario(!mostrarFormulario)}>
                <Plus size={18} /> Nuevo trámite
              </button>
            </div>

            {mostrarFormulario && (
              <div className="panel form-panel">
                <h3>Registrar solicitud</h3>

                <form onSubmit={registrarTramite}>

                  <div className="form-grid">

                    <div>
                      <label>Nombre del ciudadano</label>
                      <input required
                        value={formulario.ciudadano}
                        onChange={e => setFormulario({
                          ...formulario,
                          ciudadano: e.target.value
                        })} />
                    </div>

                    <div>
                      <label>Correo electrónico</label>
                      <input type="email" required
                        value={formulario.correo}
                        onChange={e => setFormulario({
                          ...formulario,
                          correo: e.target.value
                        })} />
                    </div>

                    <div>
                      <label>Tipo de trámite</label>
                      <select required
                        value={formulario.tipo}
                        onChange={e => setFormulario({
                          ...formulario,
                          tipo: e.target.value
                        })}>
                        <option value="">Seleccionar</option>
                        <option>Licencia de funcionamiento</option>
                        <option>Licencia de construcción</option>
                        <option>Certificado de residencia</option>
                        <option>Constancia municipal</option>
                        <option>Solicitud administrativa</option>
                      </select>
                    </div>

                    <div>
                      <label>Área responsable</label>
                      <select required
                        value={formulario.area}
                        onChange={e => setFormulario({
                          ...formulario,
                          area: e.target.value
                        })}>
                        <option value="">Seleccionar</option>
                        <option>Administración</option>
                        <option>Obras Públicas</option>
                        <option>Desarrollo Urbano</option>
                        <option>Registro Civil</option>
                        <option>Mesa de Partes</option>
                      </select>
                    </div>

                    <div className="full-width">
                      <label>Descripción</label>
                      <textarea required
                        value={formulario.descripcion}
                        onChange={e => setFormulario({
                          ...formulario,
                          descripcion: e.target.value
                        })} />
                    </div>

                  </div>

                  <div className="form-actions">
                    <button type="submit" className="primary-btn">
                      Guardar trámite
                    </button>

                    <button type="button" className="secondary-btn"
                      onClick={() => setMostrarFormulario(false)}>
                      Cancelar
                    </button>
                  </div>

                </form>
              </div>
            )}

            <div className="panel">

              <div className="search-box">
                <Search size={19} />
                <input
                  placeholder="Buscar código, ciudadano o trámite..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                />
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>CÓDIGO</th>
                      <th>CIUDADANO</th>
                      <th>TIPO</th>
                      <th>ÁREA</th>
                      <th>FECHA</th>
                      <th>ESTADO</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtrados.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="empty">
                          No existen trámites registrados.
                        </td>
                      </tr>
                    ) : filtrados.map(t => (
                      <tr key={t.id}>
                        <td>{t.codigo}</td>
                        <td>{t.ciudadano}</td>
                        <td>{t.tipo}</td>
                        <td>{t.area}</td>
                        <td>{t.fecha}</td>
                        <td>
                          <span className="status pending">
                            {t.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );

      case "Machine Learning":
        return (
          <>
            <div className="section-heading">
              <div>
                <h2>Inteligencia Artificial</h2>
                <p>Predicción de retrasos y clasificación de prioridades.</p>
              </div>
            </div>

            <div className="panel">
              <div className="ai-heading">
                <BrainCircuit size={38} />
                <div>
                  <h3>Modelo Random Forest</h3>
                  <p>Servicio predictivo pendiente de conectar con Python.</p>
                </div>
              </div>

              <div className="ai-message">
                El modelo analizará los datos históricos para identificar
                expedientes con mayor riesgo de retraso.
              </div>

              <h3>Trámites registrados para análisis: {tramites.length}</h3>
              <p>Las prioridades se mostrarán cuando se conecte el modelo entrenado.</p>
            </div>
          </>
        );

      case "Ciudadanos":
        return (
          <div className="panel">
            <h2>Gestión de ciudadanos</h2>
            <p>Los registros de ciudadanos aparecerán aquí al conectar MySQL.</p>
          </div>
        );

      case "Notificaciones":
        return (
          <div className="panel">
            <h2>Centro de notificaciones</h2>
            <p>Las notificaciones se habilitarán mediante el backend y Nodemailer.</p>
          </div>
        );

      case "Reportes":
        return (
          <>
            <div className="section-heading">
              <div>
                <h2>Reportes estadísticos</h2>
                <p>Indicadores de gestión municipal.</p>
              </div>
            </div>

            <div className="stats-grid">
              <Stat titulo="Total de trámites" valor={tramites.length} icono={<FileText />} />
              <Stat titulo="Pendientes" valor={pendientes} icono={<Clock />} />
              <Stat titulo="Finalizados" valor={finalizados} icono={<CheckCircle />} />
            </div>
          </>
        );

      default:
        return (
          <>
            <div className="welcome">
              <div>
                <h2>¡Bienvenido al sistema municipal!</h2>
                <p>Controla y administra los trámites de la Municipalidad Provincial de Yau.</p>
              </div>

              <button className="primary-btn"
                onClick={() => cambiarPagina("Gestión de trámites")}>
                <Plus size={18} /> Nuevo trámite
              </button>
            </div>

            <div className="stats-grid">
              <Stat titulo="Total de trámites" valor={tramites.length} icono={<FileText />} />
              <Stat titulo="Pendientes" valor={pendientes} icono={<Clock />} />
              <Stat titulo="Finalizados" valor={finalizados} icono={<CheckCircle />} />
              <Stat titulo="Prioridad alta" valor="--" icono={<AlertTriangle />} />
            </div>

            <div className="dashboard-grid">

              <div className="panel">
                <h3>Estado de los trámites</h3>
                <div className="chart-container">
                  <Doughnut data={datosDona} options={{
                    maintainAspectRatio: false,
                    plugins: { legend: { position: "bottom" } }
                  }} />
                </div>
              </div>

              <div className="panel">
                <h3>Trámites por área</h3>
                <div className="chart-container">
                  <Bar data={datosBarras} options={{
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
                  }} />
                </div>
              </div>

            </div>

            <div className="panel">
              <h3>Actividad reciente</h3>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>CÓDIGO</th>
                      <th>CIUDADANO</th>
                      <th>TRÁMITE</th>
                      <th>ESTADO</th>
                    </tr>
                  </thead>

                  <tbody>
                    {tramites.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="empty">
                          Todavía no existen solicitudes registradas.
                        </td>
                      </tr>
                    ) : tramites.slice(-5).reverse().map(t => (
                      <tr key={t.id}>
                        <td>{t.codigo}</td>
                        <td>{t.ciudadano}</td>
                        <td>{t.tipo}</td>
                        <td><span className="status pending">{t.estado}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
    }
  };

  return (
    <div className="app-container">

      {menuAbierto && (
        <div className="mobile-overlay"
          onClick={() => setMenuAbierto(false)} />
      )}

      <aside className={`sidebar ${menuAbierto ? "open" : ""}`}>

        <div className="logo">
          <div className="logo-icon">
            <Building2 size={25} />
          </div>

          <div>
            <h2>MUNICIPALIDAD</h2>
            <span>PROVINCIAL DE YAU</span>
          </div>

          <button className="close-menu"
            onClick={() => setMenuAbierto(false)}>
            <X />
          </button>
        </div>

        <p className="menu-title">MENÚ PRINCIPAL</p>

        <nav>
          {menu.map(item => {
            const Icon = item.icono;

            return (
              <button
                key={item.nombre}
                className={`menu-link ${pagina === item.nombre ? "active" : ""}`}
                onClick={() => cambiarPagina(item.nombre)}
              >
                <Icon size={19} />
                {item.nombre}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="avatar">AD</div>
          <div>
            <strong>Administrador</strong>
            <small>Panel administrativo</small>
          </div>
        </div>

      </aside>

      <main className="main-content">

        <header className="topbar">
          <button className="mobile-menu"
            onClick={() => setMenuAbierto(true)}>
            <Menu />
          </button>

          <div>
            <h1>{pagina}</h1>
            <p>Sistema Inteligente de Gestión Municipal</p>
          </div>

          <div className="top-profile">
            <Bell size={21} />
            <div className="avatar">AD</div>
            <span>Administrador</span>
          </div>
        </header>

        <div className="content">
          {renderContenido()}
        </div>

        <footer>
          © 2026 Municipalidad Provincial de Yau.
          Sistema Inteligente de Gestión de Trámites.
        </footer>

      </main>

    </div>
  );
}

function Stat({ titulo, valor, icono }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icono}</div>
      <p>{titulo}</p>
      <h2>{valor}</h2>
    </div>
  );
}

export default App;

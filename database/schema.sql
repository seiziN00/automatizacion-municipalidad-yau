-- Instalación inicial para MySQL 8.0.16+ (CHECK aplicados).
-- Ejecutar una vez sobre una base vacía. Las fechas DATETIME se guardan en UTC.
CREATE DATABASE IF NOT EXISTS municipalidad_yau
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE municipalidad_yau;

CREATE TABLE usuarios (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    correo VARCHAR(254) NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NOT NULL,
    nombres VARCHAR(120) NOT NULL,
    apellidos VARCHAR(120) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE roles (
    id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(32) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE usuario_roles (
    usuario_id BIGINT UNSIGNED NOT NULL,
    rol_id SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (usuario_id, rol_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (rol_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE areas (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(32) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    activa BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE usuario_areas (
    usuario_id BIGINT UNSIGNED NOT NULL,
    area_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (usuario_id, area_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (area_id) REFERENCES areas(id)
) ENGINE=InnoDB;

CREATE TABLE tipos_tramite (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(40) NOT NULL UNIQUE,
    nombre VARCHAR(160) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE estados (
    id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(32) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

-- Una versión publicada se conserva para los expedientes que ya la usan.
CREATE TABLE versiones_tramite (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tipo_tramite_id INT UNSIGNED NOT NULL,
    version SMALLINT UNSIGNED NOT NULL,
    publicada_en DATETIME(6) NULL,
    UNIQUE (tipo_tramite_id, version),
    CHECK (version > 0),
    FOREIGN KEY (tipo_tramite_id) REFERENCES tipos_tramite(id)
) ENGINE=InnoDB;

-- Una etapa puede compartir estado público con otras etapas de la misma versión.
CREATE TABLE etapas (
    version_tramite_id INT UNSIGNED NOT NULL,
    codigo VARCHAR(32) NOT NULL,
    estado_id SMALLINT UNSIGNED NOT NULL,
    area_id INT UNSIGNED NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    es_final BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (version_tramite_id, codigo),
    FOREIGN KEY (version_tramite_id) REFERENCES versiones_tramite(id),
    FOREIGN KEY (estado_id) REFERENCES estados(id),
    FOREIGN KEY (area_id) REFERENCES areas(id)
) ENGINE=InnoDB;

CREATE TABLE etapas_iniciales (
    version_tramite_id INT UNSIGNED PRIMARY KEY,
    etapa_codigo VARCHAR(32) NOT NULL,
    FOREIGN KEY (version_tramite_id, etapa_codigo)
        REFERENCES etapas(version_tramite_id, codigo)
) ENGINE=InnoDB;

CREATE TABLE transiciones (
    version_tramite_id INT UNSIGNED NOT NULL,
    origen_codigo VARCHAR(32) NOT NULL,
    destino_codigo VARCHAR(32) NOT NULL,
    PRIMARY KEY (version_tramite_id, origen_codigo, destino_codigo),
    CHECK (origen_codigo <> destino_codigo),
    FOREIGN KEY (version_tramite_id, origen_codigo)
        REFERENCES etapas(version_tramite_id, codigo),
    FOREIGN KEY (version_tramite_id, destino_codigo)
        REFERENCES etapas(version_tramite_id, codigo)
) ENGINE=InnoDB;

CREATE TABLE canales_ingreso (
    id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(32) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE expedientes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(48) NOT NULL UNIQUE,
    titular_id BIGINT UNSIGNED NOT NULL,
    registrado_por_id BIGINT UNSIGNED NOT NULL,
    version_tramite_id INT UNSIGNED NOT NULL,
    canal_ingreso_id SMALLINT UNSIGNED NOT NULL,
    asunto VARCHAR(200) NOT NULL,
    descripcion TEXT NOT NULL,
    recibido_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    -- Vencimiento vigente, calculado con las reglas aplicables al expediente.
    vence_en DATETIME(6) NULL,
    INDEX ix_expedientes_titular_fecha (titular_id, recibido_en, id),
    INDEX ix_expedientes_vencimiento (vence_en, id),
    FOREIGN KEY (titular_id) REFERENCES usuarios(id),
    FOREIGN KEY (registrado_por_id) REFERENCES usuarios(id),
    FOREIGN KEY (version_tramite_id) REFERENCES versiones_tramite(id),
    FOREIGN KEY (canal_ingreso_id) REFERENCES canales_ingreso(id),
    CHECK (vence_en IS NULL OR vence_en >= recibido_en)
) ENGINE=InnoDB;

-- etapa_codigo se interpreta dentro de la versión del expediente.
-- El servicio valida la transición bajo bloqueo del expediente.
CREATE TABLE movimientos_expediente (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    expediente_id BIGINT UNSIGNED NOT NULL,
    etapa_codigo VARCHAR(32) NOT NULL,
    actor_id BIGINT UNSIGNED NOT NULL,
    ocurrido_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    observacion_publica VARCHAR(1000) NULL,
    nota_interna TEXT NULL,
    INDEX ix_movimientos_expediente (expediente_id, id DESC),
    FOREIGN KEY (expediente_id) REFERENCES expedientes(id),
    FOREIGN KEY (actor_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE tipos_documento (
    id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(32) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE documentos_expediente (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    expediente_id BIGINT UNSIGNED NOT NULL,
    tipo_documento_id SMALLINT UNSIGNED NOT NULL,
    subido_por_id BIGINT UNSIGNED NOT NULL,
    nombre_original VARCHAR(255) NOT NULL,
    clave_almacenamiento VARBINARY(512) NOT NULL UNIQUE,
    tamano_bytes BIGINT UNSIGNED NOT NULL,
    sha256 BINARY(32) NOT NULL,
    subido_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CHECK (tamano_bytes > 0),
    FOREIGN KEY (expediente_id) REFERENCES expedientes(id),
    FOREIGN KEY (tipo_documento_id) REFERENCES tipos_documento(id),
    FOREIGN KEY (subido_por_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE extracciones_documento (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    documento_id BIGINT UNSIGNED NOT NULL,
    metodo ENUM('TEXTO_PDF', 'OCR') NOT NULL,
    motor_version VARCHAR(100) NOT NULL,
    texto_extraido MEDIUMTEXT NOT NULL,
    extraido_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    FOREIGN KEY (documento_id) REFERENCES documentos_expediente(id)
) ENGINE=InnoDB;

CREATE TABLE prioridades (
    id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(24) NOT NULL UNIQUE,
    orden SMALLINT UNSIGNED NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE versiones_modelo (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    version VARCHAR(64) NOT NULL,
    referencia_artefacto VARCHAR(500) NOT NULL,
    UNIQUE (nombre, version)
) ENGINE=InnoDB;

CREATE TABLE predicciones_prioridad (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    expediente_id BIGINT UNSIGNED NOT NULL,
    version_modelo_id INT UNSIGNED NOT NULL,
    prioridad_id SMALLINT UNSIGNED NOT NULL,
    confianza DECIMAL(7,6) NULL,
    predicho_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX ix_predicciones_expediente (expediente_id, id DESC),
    CHECK (confianza IS NULL OR confianza BETWEEN 0 AND 1),
    FOREIGN KEY (expediente_id) REFERENCES expedientes(id),
    FOREIGN KEY (version_modelo_id) REFERENCES versiones_modelo(id),
    FOREIGN KEY (prioridad_id) REFERENCES prioridades(id)
) ENGINE=InnoDB;

CREATE TABLE decisiones_prioridad (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    expediente_id BIGINT UNSIGNED NOT NULL,
    prediccion_id BIGINT UNSIGNED NULL,
    revisor_id BIGINT UNSIGNED NOT NULL,
    prioridad_id SMALLINT UNSIGNED NOT NULL,
    motivo VARCHAR(1000) NOT NULL,
    decidido_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX ix_decisiones_expediente (expediente_id, id DESC),
    FOREIGN KEY (expediente_id) REFERENCES expedientes(id),
    FOREIGN KEY (prediccion_id) REFERENCES predicciones_prioridad(id),
    FOREIGN KEY (revisor_id) REFERENCES usuarios(id),
    FOREIGN KEY (prioridad_id) REFERENCES prioridades(id)
) ENGINE=InnoDB;

-- Una alerta por cambio público. El destinatario es el titular del expediente.
CREATE TABLE alertas_estado (
    movimiento_id BIGINT UNSIGNED PRIMARY KEY,
    leida_en DATETIME(6) NULL,
    FOREIGN KEY (movimiento_id) REFERENCES movimientos_expediente(id)
) ENGINE=InnoDB;

CREATE TABLE canales_alerta (
    id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(32) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- Cola persistente. Una entrega lógica por canal y alerta.
CREATE TABLE entregas_alerta (
    movimiento_id BIGINT UNSIGNED NOT NULL,
    canal_alerta_id SMALLINT UNSIGNED NOT NULL,
    estado ENUM('PENDIENTE', 'PROCESANDO', 'ENVIADA', 'FALLIDA') NOT NULL DEFAULT 'PENDIENTE',
    intentos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    disponible_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    token_reserva BINARY(16) NULL,
    enviada_en DATETIME(6) NULL,
    ultimo_codigo_error VARCHAR(80) NULL,
    PRIMARY KEY (movimiento_id, canal_alerta_id),
    INDEX ix_entregas_cola (estado, disponible_en),
    FOREIGN KEY (movimiento_id) REFERENCES alertas_estado(movimiento_id),
    FOREIGN KEY (canal_alerta_id) REFERENCES canales_alerta(id)
) ENGINE=InnoDB;

DELIMITER $$

CREATE TRIGGER bi_expedientes_version_publicada
BEFORE INSERT ON expedientes FOR EACH ROW
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM versiones_tramite v
        JOIN etapas_iniciales i ON i.version_tramite_id = v.id
        WHERE v.id = NEW.version_tramite_id AND v.publicada_en <= CURRENT_TIMESTAMP(6)
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El trámite requiere una versión publicada con etapa inicial';
    END IF;
END$$

CREATE TRIGGER bi_movimientos_etapa_version
BEFORE INSERT ON movimientos_expediente FOR EACH ROW
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM expedientes x
        JOIN etapas e ON e.version_tramite_id = x.version_tramite_id
        WHERE x.id = NEW.expediente_id AND e.codigo = NEW.etapa_codigo
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La etapa no pertenece a la versión del expediente';
    END IF;
END$$

CREATE TRIGGER bi_decisiones_prediccion_expediente
BEFORE INSERT ON decisiones_prioridad FOR EACH ROW
BEGIN
    IF NEW.prediccion_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM predicciones_prioridad p
        WHERE p.id = NEW.prediccion_id AND p.expediente_id = NEW.expediente_id
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La predicción no pertenece al expediente';
    END IF;
END$$

DELIMITER ;

CREATE VIEW v_expedientes_situacion AS
SELECT x.id AS expediente_id, x.codigo, x.titular_id, x.recibido_en, x.vence_en,
       v.tipo_tramite_id, m.id AS movimiento_id, m.etapa_codigo,
       e.estado_id, e.area_id, e.es_final, m.ocurrido_en AS ingreso_etapa_en,
       p.prioridad_id AS prioridad_sugerida_id,
       d.prioridad_id AS prioridad_confirmada_id
FROM expedientes x
JOIN versiones_tramite v ON v.id = x.version_tramite_id
JOIN movimientos_expediente m ON m.id = (
    SELECT MAX(m2.id) FROM movimientos_expediente m2 WHERE m2.expediente_id = x.id
)
JOIN etapas e ON e.version_tramite_id = x.version_tramite_id AND e.codigo = m.etapa_codigo
LEFT JOIN predicciones_prioridad p ON p.id = (
    SELECT MAX(p2.id) FROM predicciones_prioridad p2 WHERE p2.expediente_id = x.id
)
LEFT JOIN decisiones_prioridad d ON d.id = (
    SELECT MAX(d2.id) FROM decisiones_prioridad d2 WHERE d2.expediente_id = x.id
);

CREATE VIEW v_permanencias_etapa AS
SELECT m.expediente_id, m.id AS movimiento_id, e.area_id, m.etapa_codigo,
       m.ocurrido_en AS entrada_en,
       LEAD(m.ocurrido_en) OVER (PARTITION BY m.expediente_id ORDER BY m.id) AS salida_en
FROM movimientos_expediente m
JOIN expedientes x ON x.id = m.expediente_id
JOIN etapas e ON e.version_tramite_id = x.version_tramite_id AND e.codigo = m.etapa_codigo;

INSERT INTO roles (codigo) VALUES ('CIUDADANO'), ('OPERADOR'), ('ADMIN');
INSERT INTO canales_ingreso (codigo) VALUES ('PORTAL'), ('VENTANILLA');
INSERT INTO estados (codigo, nombre) VALUES
    ('REGISTRADO', 'Registrado'), ('EN_REVISION', 'En revisión'),
    ('OBSERVADO', 'Observado'), ('FINALIZADO', 'Finalizado');
INSERT INTO tipos_documento (codigo, nombre) VALUES
    ('SOLICITUD', 'Solicitud'), ('ANEXO', 'Anexo'), ('SUBSANACION', 'Subsanación'),
    ('RESOLUCION', 'Resolución');
INSERT INTO prioridades (codigo, orden) VALUES ('ALTA', 1), ('MEDIA', 2), ('BAJA', 3);
INSERT INTO canales_alerta (codigo) VALUES ('PORTAL_TIEMPO_REAL'), ('CORREO');

-- Cuentas sin registro: solo se guarda el hash SHA-256 del token, nunca el token.
CREATE TABLE IF NOT EXISTS usuarios (
  uid TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  creado INTEGER NOT NULL
);

-- Documentos JSON por ruta ("servidores/<id>" o "data/users/<uid>/<id>"). uid es NULL en los compartidos.
CREATE TABLE IF NOT EXISTS documentos (
  ruta TEXT PRIMARY KEY,
  uid TEXT,
  datos TEXT NOT NULL,
  actualizado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS documentos_uid ON documentos(uid);

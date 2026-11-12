-- Clientes que nao querem mais o robo (opt-out).
-- Guarda apenas o hash (SHA-256 de igsid + HASH_SALT); nunca o ID real.
-- source: 'cliente' (escolheu no menu) ou 'atendente' (botao no Telegram).
CREATE TABLE IF NOT EXISTS optouts (
  user_hash  text PRIMARY KEY,
  source     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
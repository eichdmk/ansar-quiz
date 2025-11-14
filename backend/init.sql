DROP DATABASE IF EXISTS ansar_quiz;
CREATE DATABASE ansar_quiz;
\c ansar_quiz;
DROP TABLE IF EXISTS player_answers CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS answers CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS admin CASCADE;
CREATE TABLE admin (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    hash_password TEXT NOT NULL
);
-- Таблица игр (квизов)
CREATE TABLE games (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'draft',
    current_question_index INTEGER DEFAULT 0,
    question_duration INTEGER DEFAULT 30,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    is_question_closed BOOLEAN DEFAULT FALSE
);
-- Таблица вопросов
CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    position INTEGER DEFAULT 0
);
CREATE TABLE answers (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL,
    is_true BOOLEAN DEFAULT FALSE
);
CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    group_name VARCHAR(100),
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    joined_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE player_answers (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_id INTEGER REFERENCES answers(id) ON DELETE SET NULL,
    is_correct BOOLEAN,
    answered_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (player_id, question_id)
);
CREATE INDEX idx_questions_game ON questions(game_id);
CREATE INDEX idx_answers_question ON answers(question_id);
CREATE INDEX idx_players_game ON players(game_id);
CREATE INDEX idx_player_answers_question ON player_answers(question_id);
-- Таблица очереди ответов
CREATE TABLE answer_queue (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    joined_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE (game_id, question_id, player_id)
);
CREATE INDEX idx_answer_queue_game_question ON answer_queue(game_id, question_id, position);
CREATE INDEX idx_answer_queue_active ON answer_queue(game_id, question_id, is_active) WHERE is_active = TRUE;
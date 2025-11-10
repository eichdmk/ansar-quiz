CREATE DATABASE ansar_quiz;

\c ansar_quiz;
-- Таблица администратора (один пользователь)
CREATE TABLE admin (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    hash_password TEXT NOT NULL
);

-- Таблица игр (квизов)
CREATE TABLE games (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Таблица вопросов
CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Таблица ответов (варианты к каждому вопросу)
CREATE TABLE answers (
    id SERIAL PRIMARY KEY,
    question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL,
    is_true BOOLEAN DEFAULT FALSE
);

-- Таблица игроков (участники квиза)
CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    group_name VARCHAR(100),
    game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    joined_at TIMESTAMP DEFAULT NOW()
);

-- Таблица ответов игроков (для подсчёта очков и истории)
CREATE TABLE player_answers (
    id SERIAL PRIMARY KEY,
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
    answer_id INTEGER REFERENCES answers(id) ON DELETE SET NULL,
    is_correct BOOLEAN,
    answered_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для скорости
CREATE INDEX idx_game_id ON questions(game_id);
CREATE INDEX idx_question_id ON answers(question_id);
CREATE INDEX idx_player_game ON players(game_id);
CREATE INDEX idx_player_question ON player_answers(question_id);
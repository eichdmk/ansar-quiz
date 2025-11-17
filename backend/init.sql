-- Инициализация базы данных для Quiz Ansar
-- Версия: улучшенная гибридная (лучшее из обеих версий + совместимость с кодом)

DROP DATABASE IF EXISTS ansar_quiz;
CREATE DATABASE ansar_quiz;
\c ansar_quiz;

-- 1. Типы ENUM для надёжности и производительности
DO $$ BEGIN
    CREATE TYPE question_type_enum AS ENUM ('multiple_choice', 'verbal');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Вспомогательные функции для триггеров
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Функция для автоматической синхронизации evaluated_at с is_correct
CREATE OR REPLACE FUNCTION sync_evaluated_at()
RETURNS TRIGGER AS $$
BEGIN
    -- Для INSERT: если is_correct не NULL, устанавливаем evaluated_at
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_correct IS NOT NULL THEN
            NEW.evaluated_at = NOW();
        END IF;
        RETURN NEW;
    END IF;
    
    -- Для UPDATE: синхронизируем evaluated_at с изменениями is_correct
    -- Если is_correct меняется с NULL на не-NULL, устанавливаем evaluated_at
    IF OLD.is_correct IS NULL AND NEW.is_correct IS NOT NULL THEN
        NEW.evaluated_at = NOW();
    -- Если is_correct снова становится NULL, сбрасываем evaluated_at
    ELSIF OLD.is_correct IS NOT NULL AND NEW.is_correct IS NULL THEN
        NEW.evaluated_at = NULL;
    -- Если is_correct меняется между TRUE/FALSE, обновляем evaluated_at
    ELSIF OLD.is_correct IS NOT NULL AND NEW.is_correct IS NOT NULL AND OLD.is_correct != NEW.is_correct THEN
        NEW.evaluated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Таблица администраторов
DROP TABLE IF EXISTS admin CASCADE;
CREATE TABLE admin (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    hash_password TEXT NOT NULL,
    roles TEXT[] DEFAULT ARRAY['teacher']::TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
COMMENT ON COLUMN admin.hash_password IS 'BCrypt hash пароля';
COMMENT ON COLUMN admin.roles IS 'Массив ролей: teacher, editor, super_admin';

CREATE TRIGGER set_updated_at_admin
    BEFORE UPDATE ON admin
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_admin_username ON admin(username);

-- 4. Таблица игр (квизов)
DROP TABLE IF EXISTS games CASCADE;
CREATE TABLE games (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner_id INTEGER REFERENCES admin(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'running', 'finished')),
    current_question_index INTEGER DEFAULT 0,
    question_duration INTEGER DEFAULT 30 CHECK (question_duration > 0),
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    is_question_closed BOOLEAN DEFAULT FALSE
);
COMMENT ON COLUMN games.owner_id IS 'Владелец квиза (преподаватель/редактор)';
COMMENT ON COLUMN games.current_question_index IS 'Индекс текущего вопроса (0-based)';

CREATE TRIGGER set_updated_at_games
    BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_games_owner ON games(owner_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC);

-- 5. Таблица вопросов
DROP TABLE IF EXISTS questions CASCADE;
CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    position INTEGER DEFAULT 0,
    question_type question_type_enum DEFAULT 'multiple_choice'
);
COMMENT ON COLUMN questions.question_type IS 'Тип вопроса: multiple_choice (с вариантами) или verbal (устный)';

CREATE TRIGGER set_updated_at_questions
    BEFORE UPDATE ON questions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_questions_game ON questions(game_id);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(question_type);
CREATE INDEX IF NOT EXISTS idx_questions_position ON questions(game_id, position);

-- 6. Таблица вариантов ответов (только для multiple_choice)
DROP TABLE IF EXISTS answers CASCADE;
CREATE TABLE answers (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL,
    is_true BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_is_true ON answers(question_id, is_true) WHERE is_true = TRUE;

-- 7. Таблица игроков
DROP TABLE IF EXISTS players CASCADE;
CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    group_name VARCHAR(100),
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0 CHECK (score >= 0),
    joined_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_players
    BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_players_score ON players(game_id, score DESC);

-- 8. Таблица ответов игроков на вопросы с вариантами (multiple_choice)
DROP TABLE IF EXISTS player_answers CASCADE;
CREATE TABLE player_answers (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_id INTEGER REFERENCES answers(id) ON DELETE SET NULL,
    is_correct BOOLEAN,
    answered_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (player_id, question_id)
);
COMMENT ON COLUMN player_answers.is_correct IS 'Кэшированное значение правильности ответа';

CREATE INDEX IF NOT EXISTS idx_player_answers_question ON player_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_player_answers_player ON player_answers(player_id);
CREATE INDEX IF NOT EXISTS idx_player_answers_correct ON player_answers(question_id, is_correct) WHERE is_correct = TRUE;

-- 9. Таблица для устных ответов (verbal questions)
DROP TABLE IF EXISTS verbal_question_responses CASCADE;
CREATE TABLE verbal_question_responses (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    is_correct BOOLEAN,
    evaluated_at TIMESTAMP,
    answered_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (player_id, question_id)
);
COMMENT ON COLUMN verbal_question_responses.is_correct IS 'NULL = ожидает оценки, TRUE/FALSE = оценено';

CREATE TRIGGER set_updated_at_verbal
    BEFORE UPDATE ON verbal_question_responses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Триггер для автоматической синхронизации evaluated_at с is_correct
CREATE TRIGGER sync_evaluated_at_verbal
    BEFORE INSERT OR UPDATE ON verbal_question_responses
    FOR EACH ROW EXECUTE FUNCTION sync_evaluated_at();

CREATE INDEX IF NOT EXISTS idx_verbal_responses_question ON verbal_question_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_verbal_responses_player ON verbal_question_responses(player_id);
CREATE INDEX IF NOT EXISTS idx_verbal_pending ON verbal_question_responses(question_id) WHERE is_correct IS NULL;

-- 10. Таблица очереди ответов
DROP TABLE IF EXISTS answer_queue CASCADE;
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
COMMENT ON COLUMN answer_queue.position IS 'Позиция в очереди (0 = первый, следующий = +1)';

CREATE INDEX IF NOT EXISTS idx_answer_queue_game_question ON answer_queue(game_id, question_id, position);
CREATE INDEX IF NOT EXISTS idx_answer_queue_active ON answer_queue(game_id, question_id, is_active, position) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_answer_queue_player ON answer_queue(player_id);

-- 11. Миграция существующих данных: определяем типы вопросов
-- Вопросы с вариантами ответа получают question_type = 'multiple_choice'
UPDATE questions 
SET question_type = 'multiple_choice' 
WHERE EXISTS (SELECT 1 FROM answers WHERE answers.question_id = questions.id);

-- Вопросы без вариантов получают question_type = 'verbal'
UPDATE questions 
SET question_type = 'verbal' 
WHERE question_type = 'multiple_choice' 
  AND NOT EXISTS (SELECT 1 FROM answers WHERE answers.question_id = questions.id);

-- Устанавливаем default для всех NULL значений
UPDATE questions 
SET question_type = 'multiple_choice' 
WHERE question_type IS NULL;

-- The back-room inventory: what kinds of things there are, where they're kept, how many, and a
-- history of every change.

CREATE TABLE categories (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE storage_locations (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    building    VARCHAR(100) NOT NULL,
    room        VARCHAR(50)  NOT NULL,
    description VARCHAR(255),
    UNIQUE (building, room)
);

-- An item is a model of something (e.g. "Dell P2422H monitor"), counted per storage location.
-- attributes holds optional extra fields as JSON (e.g. {"Size": "24 in"}); tracking_type is always
-- COUNT for now, SERIALIZED (one row per asset tag) is reserved for later.
CREATE TABLE items (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id         BIGINT       NOT NULL REFERENCES categories (id),
    name                VARCHAR(200) NOT NULL,
    manufacturer        VARCHAR(100),
    model               VARCHAR(100),
    tracking_type       VARCHAR(20)  NOT NULL CHECK (tracking_type IN ('COUNT', 'SERIALIZED')),
    low_stock_threshold INTEGER      NOT NULL CHECK (low_stock_threshold >= 0),
    attributes          JSONB        NOT NULL DEFAULT '{}',
    archived            BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ  NOT NULL,
    UNIQUE (category_id, name)
);

CREATE TABLE stock_levels (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id          BIGINT  NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    location_id      BIGINT  NOT NULL REFERENCES storage_locations (id),
    quantity_on_hand INTEGER NOT NULL CHECK (quantity_on_hand >= 0),
    UNIQUE (item_id, location_id)
);

-- Every change to a stock level. delta is +5 for five added, -2 for two taken out.
CREATE TABLE inventory_transactions (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id     BIGINT      NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    location_id BIGINT      NOT NULL REFERENCES storage_locations (id),
    delta       INTEGER     NOT NULL,
    reason      VARCHAR(20) NOT NULL CHECK (reason IN ('RESTOCK', 'REMOVAL', 'ADJUSTMENT', 'DEPLOYMENT')),
    note        VARCHAR(500),
    admin_id    BIGINT      REFERENCES admins (id) ON DELETE SET NULL,
    occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_inventory_transactions_item ON inventory_transactions (item_id, occurred_at DESC);

-- "Move between rooms": a move is two transactions, out of one room and into the other, both MOVE.
ALTER TABLE inventory_transactions DROP CONSTRAINT inventory_transactions_reason_check;
ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_reason_check
    CHECK (reason IN ('RESTOCK', 'REMOVAL', 'ADJUSTMENT', 'DEPLOYMENT', 'MOVE'));

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO materials VALUES(1,'Wood Panels','pieces',5.0,'2025-12-10 06:10:21');
INSERT INTO materials VALUES(2,'PVC Cables','meters',5.0,'2025-12-10 06:10:21');
INSERT INTO materials VALUES(3,'3D Filament','kg',3.0,'2025-12-10 06:10:21');
INSERT INTO materials VALUES(4,'Acrylic Sheets','kg',4.0,'2025-12-10 06:15:05');
INSERT INTO materials VALUES(11,'Screwdrivers','units',1.0,'2025-12-10 07:02:08');
INSERT INTO materials VALUES(12,'Bolts','kg',0.25,'2025-12-10 07:02:21');
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence VALUES('materials',25);
COMMIT;

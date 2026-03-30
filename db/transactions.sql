PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_name TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      action TEXT NOT NULL,
      quantity REAL NOT NULL,
      timestamp TEXT NOT NULL
    );
INSERT INTO transactions VALUES(1,'3D Filament','Sharanya ','sharanya_jain@brown.edu','check-out',3.0,'12/10/2025, 1:13:50 AM');
INSERT INTO transactions VALUES(2,'3D Filament','Sharanya ','sharanya_jain@brown.edu','check-out',1.75,'12/10/2025, 1:14:13 AM');
INSERT INTO transactions VALUES(3,'3D Filament','Sharanya ','sharanya_jain@brown.edu','check-in',2.0,'12/10/2025, 1:51:55 AM');
INSERT INTO transactions VALUES(4,'3D Filament','Sharanya ','sharanya_jain@brown.edu','check-in',5.0,'12/10/2025, 3:04:51 PM');
INSERT INTO transactions VALUES(5,'3D Filament','Sharanya ','sharanya_jain@brown.edu','check-out',10.0,'12/10/2025, 3:05:08 PM');
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence VALUES('transactions',5);
COMMIT;

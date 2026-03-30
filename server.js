const express = require('express');
const { createClient } = require('@libsql/client');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const jsPDF = require('jspdf').jsPDF;

const app = express();
const PORT = process.env.PORT || 3000;

// Domain configuration
let domainConfig = {
  domain: process.env.DOMAIN || 'localhost:' + PORT
};

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Database setup (Turso / libsql)
const inventoryDb = createClient({
  url: process.env.INVENTORY_DB_URL,
  authToken: process.env.INVENTORY_DB_TOKEN,
});

const transactionsDb = createClient({
  url: process.env.TRANSACTIONS_DB_URL,
  authToken: process.env.TRANSACTIONS_DB_TOKEN,
});

// Initialize databases
async function initDatabases() {
  await inventoryDb.execute(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const initialMaterials = [
    { name: 'Wood Panels', unit: 'pieces', quantity: 5 },
    { name: 'PVC Cables', unit: 'meters', quantity: 5 },
    { name: '3D Filament', unit: 'kg', quantity: 5 }
  ];

  for (const material of initialMaterials) {
    await inventoryDb.execute({
      sql: 'INSERT OR IGNORE INTO materials (name, unit, quantity) VALUES (?, ?, ?)',
      args: [material.name, material.unit, material.quantity]
    });
  }

  await transactionsDb.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_name TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      action TEXT NOT NULL,
      quantity REAL NOT NULL,
      timestamp TEXT NOT NULL
    )
  `);

  console.log('✅ Databases initialized');
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// Get all materials
app.get('/api/materials', async (req, res) => {
  try {
    const result = await inventoryDb.execute('SELECT * FROM materials ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific material by name
app.get('/api/materials/:name', async (req, res) => {
  const materialName = decodeURIComponent(req.params.name);
  try {
    const result = await inventoryDb.execute({
      sql: 'SELECT * FROM materials WHERE name = ?',
      args: [materialName]
    });
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Material not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new material
app.post('/api/materials', async (req, res) => {
  const { name, unit, quantity } = req.body;
  if (!name || !unit || quantity === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const result = await inventoryDb.execute({
      sql: 'INSERT INTO materials (name, unit, quantity) VALUES (?, ?, ?)',
      args: [name, unit, quantity]
    });
    res.json({ id: Number(result.lastInsertRowid), name, unit, quantity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update material quantity
app.put('/api/materials/:name', async (req, res) => {
  const materialName = decodeURIComponent(req.params.name);
  const { quantity } = req.body;
  if (quantity === undefined) {
    return res.status(400).json({ error: 'Quantity is required' });
  }
  try {
    const result = await inventoryDb.execute({
      sql: 'UPDATE materials SET quantity = ? WHERE name = ?',
      args: [quantity, materialName]
    });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Material not found' });
    }
    res.json({ success: true, materialName, quantity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete material
app.delete('/api/materials/:name', async (req, res) => {
  const materialName = decodeURIComponent(req.params.name);
  try {
    const result = await inventoryDb.execute({
      sql: 'DELETE FROM materials WHERE name = ?',
      args: [materialName]
    });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Material not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit transaction (check-in / check-out)
app.post('/api/transactions', async (req, res) => {
  const { materialName, userName, userEmail, action, quantity } = req.body;
  if (!materialName || !userName || !userEmail || !action || !quantity) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Get current quantity
    const matResult = await inventoryDb.execute({
      sql: 'SELECT quantity FROM materials WHERE name = ?',
      args: [materialName]
    });
    if (matResult.rows.length === 0) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const currentQuantity = matResult.rows[0].quantity;
    let newQuantity;

    if (action === 'check-out') {
      if (quantity > currentQuantity) {
        return res.status(400).json({
          error: `Insufficient quantity. Only ${currentQuantity} available.`
        });
      }
      newQuantity = currentQuantity - quantity;
    } else if (action === 'check-in') {
      newQuantity = currentQuantity + quantity;
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    // Update inventory
    await inventoryDb.execute({
      sql: 'UPDATE materials SET quantity = ? WHERE name = ?',
      args: [newQuantity, materialName]
    });

    // Record transaction
    const estDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const txResult = await transactionsDb.execute({
      sql: `INSERT INTO transactions (material_name, user_name, user_email, action, quantity, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [materialName, userName, userEmail, action, quantity, estDate]
    });

    res.json({
      success: true,
      transactionId: Number(txResult.lastInsertRowid),
      newQuantity
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const result = await transactionsDb.execute(
      'SELECT * FROM transactions ORDER BY timestamp DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get transactions for a specific material
app.get('/api/transactions/:materialName', async (req, res) => {
  const materialName = decodeURIComponent(req.params.materialName);
  try {
    const result = await transactionsDb.execute({
      sql: 'SELECT * FROM transactions WHERE material_name = ? ORDER BY timestamp DESC',
      args: [materialName]
    });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── QR Code / Config Routes ──────────────────────────────────────────────────

app.get('/api/config/domain', (req, res) => {
  res.json(domainConfig);
});

app.put('/api/config/domain', (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain is required' });
  domainConfig.domain = domain;
  res.json({ success: true, domain: domainConfig.domain });
});

app.get('/api/qr/:materialName', async (req, res) => {
  const materialName = decodeURIComponent(req.params.materialName);
  const materialUrl = `https://${domainConfig.domain}/material/${encodeURIComponent(materialName)}`;
  try {
    const qrImage = await QRCode.toDataURL(materialUrl, {
      width: 200, margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' }
    });
    res.json({ qrCode: qrImage, url: materialUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.get('/api/qr/:materialName/download', async (req, res) => {
  const materialName = decodeURIComponent(req.params.materialName);
  const materialUrl = `https://${domainConfig.domain}/material/${encodeURIComponent(materialName)}`;
  try {
    const qrImage = await QRCode.toBuffer(materialUrl, {
      width: 200, margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' }
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="QR_${materialName.replace(/\s+/g, '_')}.png"`);
    res.send(qrImage);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.get('/api/qr/all/pdf', async (req, res) => {
  try {
    const matResult = await inventoryDb.execute('SELECT * FROM materials ORDER BY name');
    const materials = matResult.rows;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let yPosition = 20;
    const pageHeight = doc.internal.pageSize.getHeight();

    for (const material of materials) {
      if (yPosition > pageHeight - 80) {
        doc.addPage();
        yPosition = 20;
      }
      const materialUrl = `https://${domainConfig.domain}/material/${encodeURIComponent(material.name)}`;
      const qrImage = await QRCode.toDataURL(materialUrl, {
        width: 200, margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' }
      });
      doc.addImage(qrImage, 'PNG', 30, yPosition, 60, 60);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text(`Material: ${material.name}`, 100, yPosition + 10);
      doc.text(`Unit: ${material.unit}`, 100, yPosition + 20);
      doc.text(`Available: ${material.quantity}`, 100, yPosition + 30);
      yPosition += 80;
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="BDW_Material_QR_Codes.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
});

// ─── HTML Pages ───────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/history', (req, res) => res.sendFile(path.join(__dirname, 'public', 'history.html')));
app.get('/material/:name', (req, res) => res.sendFile(path.join(__dirname, 'public', 'material.html')));

// ─── Start ────────────────────────────────────────────────────────────────────

initDatabases()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Brown Design Workshop Material Circulation Station`);
      console.log(`📍 Server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to initialize databases:', err);
    process.exit(1);
  });
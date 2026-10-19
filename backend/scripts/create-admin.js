
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(resolve => rl.question(q, resolve));

(async () => {
  try {
    const name = (await ask('Nom administrateur : ')).trim();
    const email = (await ask('E-mail administrateur : ')).trim().toLowerCase();
    const phone = (await ask('Téléphone : ')).trim();
    const password = await ask('Mot de passe (10 caractères minimum) : ');
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length < 6 || password.length < 10 || password.length > 72) {
      throw new Error('Données invalides. Vérifiez nom, e-mail, téléphone et mot de passe.');
    }
    const hash = await bcrypt.hash(password, 12);
    await db.execute(
      `INSERT INTO users (name,email,phone,password_hash,role) VALUES (?,?,?,?, 'admin')`,
      [name, email, phone, hash]
    );
    console.log('Compte administrateur créé. Conservez le mot de passe en sécurité.');
  } catch (e) {
    console.error('Création impossible :', e.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await db.end();
  }
})();

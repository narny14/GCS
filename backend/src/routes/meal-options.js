const express = require('express');
const db = require('../config/db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      'SELECT id,group_key,name,description,price,image_url FROM meal_options WHERE is_available=1 ORDER BY FIELD(group_key,"base","viande","accompagnement","legumes","boisson","supplements"),sort_order,id'
    );
    const groups = {
      base: [], viande: [], accompagnement: [], legumes: [], boisson: [], supplements: []
    };
    for (const row of rows) groups[row.group_key].push(row);
    res.json({ options: rows, groups });
  } catch (err) { next(err); }
});

module.exports = router;

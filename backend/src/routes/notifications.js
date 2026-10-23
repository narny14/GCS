'use strict';
const express=require('express');
const router=express.Router();
const db=require('../config/db');
const {registerDevice,deactivateDevice}=require('../services/notifications0');
// IMPORTANT: monter ce routeur derrière le middleware auth qui remplit req.user.id.
router.post('/device',async(req,res,next)=>{try{
 const userId=req.user&&req.user.id;if(!userId)return res.status(401).json({error:'Authentification requise.'});
 const {installationId,token,platform,deviceLabel}=req.body||{};
 if(typeof installationId!=='string'||installationId.length<8||installationId.length>128)return res.status(400).json({error:'installationId invalide.'});
 if(typeof token!=='string'||token.length<20||token.length>4096)return res.status(400).json({error:'FCM token invalide.'});
 await registerDevice({userId,installationId,token,platform,deviceLabel});res.json({ok:true});
 }catch(e){next(e);}});
router.delete('/device/:installationId',async(req,res,next)=>{try{
 const userId=req.user&&req.user.id;if(!userId)return res.status(401).json({error:'Authentification requise.'});
 await deactivateDevice({userId,installationId:req.params.installationId});res.json({ok:true});
 }catch(e){next(e);}});
router.get('/mine',async(req,res,next)=>{try{
 const userId=req.user&&req.user.id;if(!userId)return res.status(401).json({error:'Authentification requise.'});
 const [rows]=await db.execute(`SELECT id,order_id AS orderId,notification_type AS type,title,body,data_json AS data,delivery_status AS deliveryStatus,created_at AS createdAt,sent_at AS sentAt,read_at AS readAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100`,[userId]);res.json({notifications:rows});
 }catch(e){next(e);}});
router.post('/:id/read',async(req,res,next)=>{try{
 const userId=req.user&&req.user.id;if(!userId)return res.status(401).json({error:'Authentification requise.'});
 const [r]=await db.execute('UPDATE notifications SET read_at=NOW() WHERE id=? AND user_id=?',[req.params.id,userId]);if(!r.affectedRows)return res.status(404).json({error:'Notification introuvable.'});res.json({ok:true});
 }catch(e){next(e);}});
module.exports=router;

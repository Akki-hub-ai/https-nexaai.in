import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express(); app.disable("x-powered-by"); app.use(express.json({limit:"32kb"}));
const port=Number(process.env.PORT||3000);
const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
const FREE=Number(process.env.FREE_MONTHLY_MESSAGES||100);
const PRO=Number(process.env.PRO_MONTHLY_MESSAGES||5000);

const limiter=rateLimit({windowMs:60*1000,limit:30,standardHeaders:"draft-8",legacyHeaders:false});
app.use("/api/",limiter);
app.use(express.static(path.join(__dirname,"public")));

async function auth(req,res,next){
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer ")) return res.status(401).json({error:"Please sign in."});
  const token=h.slice(7);
  const {data:{user},error}=await supabase.auth.getUser(token);
  if(error||!user) return res.status(401).json({error:"Your session has expired. Please sign in again."});
  req.user=user;
  let {data:profile}=await supabase.from("profiles").select("*").eq("id",user.id).maybeSingle();
  if(!profile){
    await supabase.from("profiles").insert({id:user.id,email:user.email});
    ({data:profile}=await supabase.from("profiles").select("*").eq("id",user.id).single());
  }
  req.profile=profile; next();
}

async function usage(req,res,next){
  const current=new Date().toISOString().slice(0,7)+"-01";
  let p=req.profile;
  if(p.usage_month!==current){
    const {data}=await supabase.from("profiles").update({monthly_messages:0,usage_month:current}).eq("id",req.user.id).select("*").single();
    if(data){req.profile=data;p=data;}
  }
  const limit=p.plan==="pro"?PRO:FREE;
  if(p.monthly_messages>=limit) return res.status(429).json({error:`Monthly ${p.plan} plan limit reached. Upgrade or wait for the next billing month.`});
  req.messageLimit=limit; next();
}

app.get("/api/health",(_,res)=>res.json({ok:true}));

app.get("/api/me",auth,(req,res)=>res.json({
  id:req.user.id,email:req.user.email,profile:req.profile,
  usage:{used:req.profile.monthly_messages,limit:req.profile.plan==="pro"?PRO:FREE}
}));

app.get("/api/chats",auth,async(req,res)=>{
  const {data,error}=await supabase.from("conversations").select("id,title,created_at,updated_at")
    .eq("user_id",req.user.id).order("updated_at",{ascending:false}).limit(50);
  if(error)return res.status(500).json({error:error.message}); res.json({chats:data||[]});
});

app.get("/api/chats/:id",auth,async(req,res)=>{
  const {data:c}=await supabase.from("conversations").select("*").eq("id",req.params.id).eq("user_id",req.user.id).single();
  if(!c)return res.status(404).json({error:"Chat not found."});
  const {data:messages,error}=await supabase.from("messages").select("id,role,content,created_at")
    .eq("conversation_id",c.id).eq("user_id",req.user.id).order("created_at",{ascending:true});
  if(error)return res.status(500).json({error:error.message}); res.json({chat:c,messages:messages||[]});
});

app.post("/api/chat",auth,usage,async(req,res)=>{
  const message=typeof req.body?.message==="string"?req.body.message.trim():"";
  let conversationId=req.body?.conversationId||null;
  if(!message)return res.status(400).json({error:"Enter a question."});
  if(message.length>8000)return res.status(400).json({error:"Question is too long."});

  if(conversationId){
    const {data:c}=await supabase.from("conversations").select("id").eq("id",conversationId).eq("user_id",req.user.id).single();
    if(!c)conversationId=null;
  }
  if(!conversationId){
    const title=message.length>55?message.slice(0,55)+"…":message;
    const {data:c,error}=await supabase.from("conversations").insert({user_id:req.user.id,title}).select().single();
    if(error)return res.status(500).json({error:error.message}); conversationId=c.id;
  }

  const {data:old}=await supabase.from("messages").select("role,content").eq("conversation_id",conversationId)
    .order("created_at",{ascending:false}).limit(12);
  const context=(old||[]).reverse().map(x=>({role:x.role,content:x.content}));
  await supabase.from("messages").insert({conversation_id:conversationId,user_id:req.user.id,role:"user",content:message});

  try{
    const r=await ai.responses.create({
      model:process.env.OPENAI_MODEL||"gpt-5.6-luna",
      instructions:"You are NexaAI, a helpful general-purpose AI assistant. Answer clearly and accurately. If uncertain, say so. Do not claim actions you did not perform. The Managing Director of NexaAI is Akash Jadhav.",
      input:[...context,{role:"user",content:message}],max_output_tokens:2500
    });
    const answer=r.output_text||"I couldn't generate an answer.";
    await supabase.from("messages").insert({conversation_id:conversationId,user_id:req.user.id,role:"assistant",content:answer});
    const {data:updated}=await supabase.from("profiles").update({monthly_messages:req.profile.monthly_messages+1}).eq("id",req.user.id).select("*").single();
    res.json({answer,conversationId,usage:{used:updated?.monthly_messages??req.profile.monthly_messages+1,limit:req.messageLimit}});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"AI service is temporarily unavailable."});
  }
});

async function admin(req,res,next){
  if(!req.profile?.is_admin)return res.status(403).json({error:"Admin access required."});
  next();
}
app.get("/api/admin/stats",auth,admin,async(req,res)=>{
  const {count:users}=await supabase.from("profiles").select("*",{count:"exact",head:true});
  const {count:pro}=await supabase.from("profiles").select("*",{count:"exact",head:true}).eq("plan","pro");
  const {count:chats}=await supabase.from("conversations").select("*",{count:"exact",head:true});
  res.json({users:users||0,pro:pro||0,chats:chats||0});
});
app.get("/api/admin/users",auth,admin,async(req,res)=>{
  const {data,error}=await supabase.from("profiles").select("id,email,full_name,plan,monthly_messages,is_admin,created_at").order("created_at",{ascending:false}).limit(200);
  if(error)return res.status(500).json({error:error.message}); res.json({users:data||[]});
});

app.get("*splat",(_,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(port,()=>console.log(`NexaAI v2 running on http://localhost:${port}`));

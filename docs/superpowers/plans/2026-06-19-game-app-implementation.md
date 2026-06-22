# 3A游戏直卖&福袋 App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform mobile app for 3A game trading — direct CDK sales, blind-box lucky bags, player-to-player game exchange, community reviews, points/tasks/achievements, coupons, and a full admin backend.

**Architecture:** Flutter mobile app + NestJS backend (modular monolith) + React Admin web panel + PostgreSQL + Redis. Module boundaries are clean with well-defined API contracts. CDK encryption via KMS + AES-256-GCM. Payments via WeChat + Alipay.

**Tech Stack:** Flutter 3.x, NestJS (TypeScript), PostgreSQL 15, Redis 7, React + Ant Design 5, JWT auth, WebSocket (socket.io), file upload to OSS/COS, third-party push (Jiguang), third-party customer service SDK.

**Design Doc:** `d:\claude创建文件\3A游戏App-设计文档.md` (2631 lines, 131KB)

## Global Constraints

- All code and comments in Chinese (doc/comments), variable names in English
- New files created under `d:\claude创建文件` by default
- CDK plaintext NEVER appears in logs
- Shop-purchased games CANNOT be exchanged or used as trade-up materials (lucky bag games only)
- Website-wide HTTPS, TLS 1.2+
- JWT access token 2h, refresh token 30d
- Rate limits: 100 req/s per IP, 50 req/s per user
- CDK decrypt rate limit: 3/min per user
- Minors (age < 18): max ¥200/single, ¥400/day, ¥2000/month
- All admin operations logged with before/after detail

---

# ChaloPB — Real-Time Bus Tracking Platform

> Real-time public transport tracking and fleet management platform.

ChaloPB is a full-stack real-time bus tracking platform designed for efficient public transport monitoring and fleet operations. Passengers can track buses live on an interactive map, receive estimated arrival times, and monitor stop-by-stop trip progress in real time. Drivers are provided with a dedicated operational dashboard, while administrators manage routes, vehicles, drivers, and schedules through a centralized control panel.
## Features
* **Live Bus Tracking** — Real-time GPS tracking displayed on an interactive map
* **Dynamic ETA Calculation** — Estimated arrival times generated using OSRM routing
* **Stop Status Monitoring** — Track bus progress with approaching, arrived, and departed states
* **Real-Time Updates** — Instant trip and location updates using Socket.IO WebSockets
* **Driver Dashboard** — Trip management, GPS broadcasting, and route monitoring tools
* **Admin Management Panel** — Full management system for routes, stops, buses, drivers, and scheduling
* **Authentication & Authorization** — JWT-based role access for users, drivers, and administrators
* **Redis Caching** — Optimized low-latency reads for live location and trip data
* **Batch GPS Processing** — Efficient high-frequency GPS update handling with batched database writes

## Technology Stack
### Backend
| Layer          | Technology                 |
| -------------- | -------------------------- |
| Runtime        | Node.js (ESM)              |
| Framework      | Express.js v5              |
| Database       | PostgreSQL (Supabase)      |
| Realtime       | Socket.IO + Redis Adapter  |
| Cache          | Redis                      |
| Authentication | JWT + bcryptjs             |
| Routing Engine | OSRM                       |
| Security       | Helmet, express-rate-limit |
| Testing        | Jest                       |

### Web Frontend
| Layer       | Technology                      |
| ----------- | ------------------------------- |
| Framework   | React 19 + Vite                 |
| Styling     | Tailwind CSS v4                 |
| Maps        | React Leaflet + Google Maps API |
| Realtime    | Socket.IO Client                |
| HTTP Client | Axios                           |
| Routing     | React Router v7                 |
| Testing     | Vitest                          |

### Mobile Application
| Layer             | Technology                 |
| ----------------- | -------------------------- |
| Framework         | React Native + Expo SDK 54 |
| Language          | TypeScript                 |
| Maps              | React Native Maps          |
| Navigation        | React Navigation v7        |
| Location Services | expo-location              |
| Realtime          | Socket.IO Client           |

### Infrastructure
| Service  | Purpose                                   |
| -------- | ----------------------------------------- |
| Supabase | Hosted PostgreSQL with Row Level Security |
| Redis    | Socket.IO scaling and caching             |
| OSRM     | ETA calculation and route processing      |
| Vercel   | Web application deployment                |

---

## Project Structure

```bash
ChaloPB/
├── Backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── routes/
│   │   ├── middlewares/
│   │   ├── repositories/
│   │   ├── jobs/
│   │   ├── utils/
│   │   └── config/
│   ├── migrations/
│   └── schema.sql
│
├── web/
│   └── src/
│       ├── pages/
│       │   ├── user/
│       │   ├── driver/
│       │   └── admin/
│       ├── hooks/
│       └── context/
│
└── mobile/
    └── src/
        ├── screens/
        │   ├── user/
        │   ├── driver/
        │   └── admin/
        ├── hooks/
        └── socket/

# Running ChaloPB Locally
```
## 1. Clone the Repository
```bash
git clone <your-repo-url>
cd ChaloPB
```

# Backend Setup
## 2. Install Dependencies
```bash
cd Backend
npm install
```
## 3. Create Environment File
Create a `.env` file inside `Backend/`
```env
PORT=3000
DATABASE_URL=your_supabase_postgres_url
JWT_SECRET=your_jwt_secret
REDIS_URL=redis://localhost:6379
CORS_ORIGINS=http://localhost:5173
OSRM_URL=https://router.project-osrm.org
```
## 4. Setup Database
* Create a Supabase project
* Open SQL Editor
* Run:
```bash
Backend/schema.sql
```
## 5. Start Backend
```bash
npm run migrate
npm run dev
```
Backend runs on:
```bash
http://localhost:3000
```

# Web Frontend Setup
## 6. Install Dependencies
```bash
cd ../web
npm install
```
## 7. Create Web Environment File
Create `.env` inside `web/`
```env
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key
```
## 8. Start Web Frontend
```bash
npm run dev
```
Web app runs on:
```bash
http://localhost:5173
```


# Mobile App Setup
## 9. Install Dependencies
```bash
cd ../mobile
npm install
```
## 10. Create Mobile Environment File
Create `.env` inside `mobile/`
```env
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:3000
EXPO_PUBLIC_SOCKET_URL=http://YOUR_LOCAL_IP:3000
```
## 11. Start Mobile App
```bash
npx expo start
```


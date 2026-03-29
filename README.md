# 🚗 inDala AI — Предиктивная система оценки сельской мобильности

> **Decentrathon 5.0** | Track: inDrive — Справедливая мобильность

---

## 📋 Проблема

Более **40% населения Казахстана** проживает в сельской местности, где транспортная изоляция — системный барьер:

- 🏥 Отсутствие больниц в радиусе 50+ км
- 🛤️ Нет асфальтированных дорог — сезонное бездорожье
- 🚌 Нет общественного транспорта
- ❄️ Суровые зимы — дороги непроходимы
- 📡 Нет связи — невозможно вызвать такси через приложение

Существующие модели субсидирования **не учитывают реальную уязвимость** конкретных маршрутов.

## 💡 Решение

**inDala AI** использует **открытые данные (OpenStreetMap)** и **ML (XGBoost + SHAP)** для расчёта **Индекса Уязвимости Мобильности** (0-100) и справедливых субсидий для водителей inDrive.

### Как это работает:
1. Пользователь **кликает на карту** — выбирает точку отправления и назначения
2. **OSRM** строит точный дорожный маршрут по данным OpenStreetMap
3. **XGBoost** рассчитывает индекс уязвимости маршрута
4. **SHAP** объясняет, какой фактор и на сколько повлиял (Explainable AI)
5. Система рекомендует **справедливую субсидию в ₸**

---

## 🏗️ Архитектура

> Полиглотная микросервисная архитектура, построенная на принципах Martin Kleppmann (*Designing Data-Intensive Applications*)

```mermaid
graph LR
    subgraph "Docker Network (indala-net)"
        A["🌐 React + TypeScript<br/>Frontend<br/>:3000"] -->|"/api/*"| B["⚡ Go Gateway<br/>Fiber<br/>:8080"]
        B -->|"POST /predict"| C["🧠 Python FastAPI<br/>ML Service<br/>:8000"]
        B -->|"GET /route/v1/driving"| D["🗺️ OSRM Backend<br/>OpenStreetMap<br/>:5000"]
    end

    style A fill:#dbeafe,stroke:#3b82f6,color:#1e40af
    style B fill:#fef3c7,stroke:#f59e0b,color:#92400e
    style C fill:#ede9fe,stroke:#8b5cf6,color:#5b21b6
    style D fill:#dcfce7,stroke:#22c55e,color:#166534
```

### Обоснование выбора технологий

| Компонент | Технология | Почему |
|:--|:--|:--|
| **API Gateway** | Go (Fiber) | Высокая пропускная способность, низкая латентность. Идеально для data-intensive систем *(Kleppmann, Ch.1)* |
| **ML Service** | Python (FastAPI) | Изоляция ML для независимого масштабирования. Разделение ответственности *(Ch.4)* |
| **Routing** | OSRM | **Air-gapped** маршрутизация: данные карт не покидают контур — критично для GovTech |
| **Frontend** | React + TypeScript | Интерактивная карта Leaflet с click-to-place маршрутами |

> [!IMPORTANT]
> **Security by design**: OSRM работает полностью локально. Все геоданные обрабатываются внутри Docker-контура без обращений к внешним API. Это ключевое требование для государственных проектов (GovTech).

### Ключевые архитектурные принципы

- **Reliability** — каждый сервис изолирован; падение ML не роняет gateway
- **Scalability** — горизонтальное масштабирование: `docker compose scale python-ml=3`
- **Maintainability** — ML-инженеры работают с Python, backend с Go, фронтенд отдельно

---

## 🚀 Быстрый старт

### Предварительные требования

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose
- ~2 ГБ свободного места (для карты Казахстана)

### 1. Клонируем и настраиваем

```bash
git clone https://github.com/your-username/indala-ai.git
cd indala-ai
cp .env.example .env
```

### 2. Скачиваем карту Казахстана

```bash
wget -P osrm-data/ https://download.geofabrik.de/asia/kazakhstan-latest.osm.pbf
```

> [!NOTE]
> Файл ~300 МБ. При первом запуске OSRM автоматически обработает его (extract → partition → customize). Это займёт 3-5 минут.

### 3. Запускаем

```bash
docker compose up --build
```

### Доступ

| Сервис | Порт по умолчанию | Описание |
|:--|:--|:--|
| 🌐 Frontend | [localhost:3000](http://localhost:3000) | Интерактивная карта |
| ⚡ API Gateway | [localhost:8080](http://localhost:8080/health) | Go Fiber |
| 🧠 ML Service | [localhost:8000](http://localhost:8000/health) | FastAPI |
| 🗺️ OSRM | [localhost:5000](http://localhost:5000) | Routing engine |

> [!NOTE]
> Порты настраиваются через `.env`. Если фронтенд запущен через Vite dev-сервер, порт по умолчанию — `5173`.

### Проверка API

```bash
curl -X POST http://localhost:8080/api/v1/analyze-route \
  -H "Content-Type: application/json" \
  -d '{
    "start_lat": 51.1282,
    "start_lng": 71.4304,
    "end_lat": 50.5889,
    "end_lng": 69.9916
  }'
```

---

## 📁 Структура проекта

```
indala-ai/
├── docker-compose.yml          # 4 сервиса: frontend, go-api, python-ml, osrm
├── .env.example                # Шаблон переменных окружения
├── .gitignore
├── README.md
├── gateway/                    # Go API Gateway
│   ├── main.go                 # Fiber + OSRM [lon,lat] + ML proxy
│   ├── go.mod / go.sum
│   └── Dockerfile
├── ml-service/                 # Python ML сервис
│   ├── main.py                 # FastAPI + mock XGBoost + SHAP
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                   # React Frontend
│   ├── src/
│   │   ├── App.tsx             # Карта с click-to-place + GeoJSON маршрут
│   │   ├── main.tsx
│   │   ├── index.css           # Светлая тема
│   │   └── types.ts
│   ├── nginx.conf              # Конфигурация веб-сервера
│   └── Dockerfile
└── osrm-data/                  # Данные OSRM (gitignored)
    └── kazakhstan-latest.osm.pbf  ← скачать вручную
```

---

## 🧠 ML Модель

**Текущая версия:** `mock-xgboost-v0.2.0` (прототип)

> [!TIP]
> Модель детерминированная: одни и те же координаты всегда дают одинаковый результат. Для продакшена будет training pipeline на реальных данных stat.gov.kz + OpenWeather.

| Фактор уязвимости | Вклад в индекс |
|:--|:--|
| Отсутствие больниц (50 км) | +8..35 |
| Суровые зимние условия | +5..25 |
| Нет асфальтированных дорог | +10..30 |
| Нет общественного транспорта | +10..30 |
| Сезонное бездорожье | +5..20 |

**Формула субсидии:** `base_rate (45₸/км) × distance × (1 + score/100 × 1.5)`

---

## 📜 Лицензия

MIT License

---

<p align="center">
  Сделано с 💙 для <strong>Decentrathon 5.0</strong> | Трек: inDrive
</p>

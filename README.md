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

**inDala AI** — предиктивная платформа, которая использует **открытые данные** и **машинное обучение** для расчёта **Индекса Уязвимости Мобильности** (0-100) и справедливых субсидий для водителей inDrive.

### Как это работает:
1. Пользователь **кликает на карту** — выбирает маршрут
2. **OSRM** строит точный дорожный маршрут по данным OpenStreetMap
3. **XGBoost** рассчитывает индекс уязвимости на основе данных eGov и краудсорсинга
4. **SHAP** объясняет, какой фактор и на сколько повлиял (Explainable AI)
5. Система рекомендует **справедливую субсидию в ₸**

---

## 👥 Целевые пользователи

| Пользователь | Потребность | Что даёт inDala AI |
|:--|:--|:--|
| 🏘️ **Жители сёл** | Доступные поездки | Обоснованные субсидии — снижение стоимости поездок на 30-50% |
| 🚗 **Водители** | Справедливая оплата за сложные маршруты | Объективные надбавки на основе данных, а не субъективных оценок |
| 🏛️ **Акиматы (Gov)** | Мониторинг мобильности региона | Data-dashboard с картой уязвимости для принятия решений |

---

## 🏗️ Архитектура

Микросервисная архитектура.

```mermaid
flowchart TB
    subgraph Clients
        V["Жители сёл"]
        D["Водители"]
        G["Акиматы"]
    end

    subgraph Frontend["React + TypeScript :3000"]
        MAP["Leaflet Map"]
        DASH["Dashboard / Score Panel"]
    end

    subgraph Gateway["Go Fiber Gateway :8080"]
        AUTH["Auth Middleware"]
        PROXY["Route Orchestrator"]
        FB["POST /feedback"]
    end

    subgraph Services
        ML["Python FastAPI :8000\nXGBoost + SHAP"]
        OSRM["OSRM Backend :5000\nOpenStreetMap"]
    end

    subgraph Storage["PostgreSQL"]
        POI["eGov POIs\nбольницы, школы, дороги"]
        FBD["Live Road Quality\nкраудсорсинг водителей"]
        SCORES["Calculated Scores\nистория анализов"]
    end

    V & D & G --> MAP & DASH
    MAP & DASH -->|"/api/*"| AUTH
    AUTH --> PROXY
    PROXY -->|"GET /route"| OSRM
    PROXY -->|"POST /predict"| ML
    PROXY -->|"SELECT"| POI & SCORES
    FB -->|"INSERT"| FBD
    ML -->|"SELECT"| POI & FBD
    D -->|"Репорт о дороге"| FB
```

### Обоснование выбора технологий

| Компонент | Технология | Почему |
|:--|:--|:--|
| **Frontend** | React + TypeScript | SPA с интерактивной картой Leaflet, адаптивный UI |
| **Gateway** | Go (Fiber) | Оркестратор: auth, проксирование, бизнес-логика. Высокая пропускная способность |
| **ML Engine** | Python (FastAPI) | Инференс XGBoost + SHAP объяснения. Изолирован для независимого масштабирования |
| **Routing** | OSRM (Docker) | Локальный routing engine — **air-gapped**, данные не покидают контур |
| **Storage** | PostgreSQL | Единый источник истины: eGov POIs, фидбек водителей, история скорингов |

### Стратегия данных

**Гибридная синхронизация:**

- **Предзагруженные данные eGov** — стабильная основа: координаты больниц, школ, автобусных остановок из открытых реестров. Обновляются batch-импортом
- **Real-time API** — погода (OpenWeather), актуальное состояние дорог
- **Краудсорсинг** — водители inDrive отправляют репорты о дорожных условиях (ямы, снег, перекрытия) через `POST /api/v1/feedback`. Эти данные попадают в таблицу `Live Road Quality` и корректируют индекс уязвимости в реальном времени

```
eGov Open Data (batch)  ──┐
OpenWeather API (live)  ──┼──▶  ML Engine  ──▶  Vulnerability Score
Driver Feedback (crowd) ──┘
```

> [!IMPORTANT]
> **Security by design**: OSRM работает полностью локально. Все геоданные обрабатываются внутри Docker-контура без обращений к внешним API. Критично для государственных проектов (GovTech).

---

## 🚀 Быстрый старт

### Предварительные требования

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose
- ~2 ГБ свободного места (для карты Казахстана)

### 1. Клонируем и настраиваем

```bash
git clone https://github.com/OJsnuly/indala-ai.git
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
# Анализ маршрута
curl -X POST http://localhost:8080/api/v1/analyze-route \
  -H "Content-Type: application/json" \
  -d '{
    "start_lat": 51.1282, "start_lng": 71.4304,
    "end_lat": 50.5889, "end_lng": 69.9916
  }'

# Фидбек водителя о дороге
curl -X POST http://localhost:8080/api/v1/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "driver_id": "drv_001",
    "lat": 50.85, "lng": 70.3,
    "type": "pothole", "severity": 7,# 🚗 inDala AI — Предиктивная система оценки сельской мобильности

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

**inDala AI** — предиктивная платформа, которая использует **открытые данные** и **машинное обучение** для расчёта **Индекса Уязвимости Мобильности** (0-100) и справедливых субсидий для водителей inDrive.

### Как это работает:
1. Пользователь **кликает на карту** — выбирает маршрут
2. **OSRM** строит точный дорожный маршрут по данным OpenStreetMap
3. **XGBoost** рассчитывает индекс уязвимости на основе данных eGov и краудсорсинга
4. **SHAP** объясняет, какой фактор и на сколько повлиял (Explainable AI)
5. Система рекомендует **справедливую субсидию в ₸**

---

## 👥 Целевые пользователи

| Пользователь | Потребность | Что даёт inDala AI |
|:--|:--|:--|
| 🏘️ **Жители сёл** | Доступные поездки | Обоснованные субсидии — снижение стоимости поездок на 30-50% |
| 🚗 **Водители** | Справедливая оплата за сложные маршруты | Объективные надбавки на основе данных, а не субъективных оценок |
| 🏛️ **Акиматы (Gov)** | Мониторинг мобильности региона | Data-dashboard с картой уязвимости для принятия решений |

---

## 🏗️ Архитектура — Production-Ready MVP

Микросервисная архитектура, реалистичная для реализации за 2 дня. Каждый компонент выбран по принципу: **максимум пользы при минимуме сложности**.

```mermaid
flowchart TB
    subgraph Clients
        V["Жители сёл"]
        D["Водители"]
        G["Акиматы"]
    end

    subgraph Frontend["React + TypeScript :3000"]
        MAP["Leaflet Map"]
        DASH["Dashboard / Score Panel"]
    end

    subgraph Gateway["Go Fiber Gateway :8080"]
        AUTH["Auth Middleware"]
        PROXY["Route Orchestrator"]
        FB["POST /feedback"]
    end

    subgraph Services
        ML["Python FastAPI :8000\nXGBoost + SHAP"]
        OSRM["OSRM Backend :5000\nOpenStreetMap"]
    end

    subgraph Storage["PostgreSQL"]
        POI["eGov POIs\nбольницы, школы, дороги"]
        FBD["Live Road Quality\nкраудсорсинг водителей"]
        SCORES["Calculated Scores\nистория анализов"]
    end

    V & D & G --> MAP & DASH
    MAP & DASH -->|"/api/*"| AUTH
    AUTH --> PROXY
    PROXY -->|"GET /route"| OSRM
    PROXY -->|"POST /predict"| ML
    PROXY -->|"SELECT"| POI & SCORES
    FB -->|"INSERT"| FBD
    ML -->|"SELECT"| POI & FBD
    D -->|"Репорт о дороге"| FB
```

### Обоснование выбора технологий

| Компонент | Технология | Почему |
|:--|:--|:--|
| **Frontend** | React + TypeScript | SPA с интерактивной картой Leaflet, адаптивный UI |
| **Gateway** | Go (Fiber) | Оркестратор: auth, проксирование, бизнес-логика. Высокая пропускная способность |
| **ML Engine** | Python (FastAPI) | Инференс XGBoost + SHAP объяснения. Изолирован для независимого масштабирования |
| **Routing** | OSRM (Docker) | Локальный routing engine — **air-gapped**, данные не покидают контур |
| **Storage** | PostgreSQL | Единый источник истины: eGov POIs, фидбек водителей, история скорингов |

### Стратегия данных

**Гибридная синхронизация:**

- **Предзагруженные данные eGov** — стабильная основа: координаты больниц, школ, автобусных остановок из открытых реестров. Обновляются batch-импортом
- **Real-time API** — погода (OpenWeather), актуальное состояние дорог
- **Краудсорсинг** — водители inDrive отправляют репорты о дорожных условиях (ямы, снег, перекрытия) через `POST /api/v1/feedback`. Эти данные попадают в таблицу `Live Road Quality` и корректируют индекс уязвимости в реальном времени

```
eGov Open Data (batch)  ──┐
OpenWeather API (live)  ──┼──▶  ML Engine  ──▶  Vulnerability Score
Driver Feedback (crowd) ──┘
```

> [!IMPORTANT]
> **Security by design**: OSRM работает полностью локально. Все геоданные обрабатываются внутри Docker-контура без обращений к внешним API. Критично для государственных проектов (GovTech).

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
# Анализ маршрута
curl -X POST http://localhost:8080/api/v1/analyze-route \
  -H "Content-Type: application/json" \
  -d '{
    "start_lat": 51.1282, "start_lng": 71.4304,
    "end_lat": 50.5889, "end_lng": 69.9916
  }'

# Фидбек водителя о дороге
curl -X POST http://localhost:8080/api/v1/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "driver_id": "drv_001",
    "lat": 50.85, "lng": 70.3,
    "type": "pothole", "severity": 7,
    "description": "Глубокая яма после моста"
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
│   ├── main.go                 # Fiber + OSRM + ML proxy
│   ├── models/
│   │   └── feedback.go         # Структура краудсорсинг-данных
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
> Модель детерминированная: одни и те же координаты всегда дают одинаковый результат. Для продакшена — training pipeline на реальных данных stat.gov.kz + OpenWeather + краудсорсинг.

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

    "description": "Глубокая яма после моста"
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
│   ├── main.go                 # Fiber + OSRM + ML proxy
│   ├── models/
│   │   └── feedback.go         # Структура краудсорсинг-данных
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
> Модель детерминированная: одни и те же координаты всегда дают одинаковый результат. Для продакшена — training pipeline на реальных данных stat.gov.kz + OpenWeather + краудсорсинг.

| Фактор уязвимости | Вклад в индекс |
|:--|:--|
| Отсутствие больниц (50 км) | +8..35 |
| Суровые зимние условия | +5..25 |
| Нет асфальтированных дорог | +10..30 |
| Нет общественного транспорта | +10..30 |
| Сезонное бездорожье | +5..20 |

**Формула субсидии:** `base_rate (45₸/км) × distance × (1 + score/100 × 1.5)`

---


<p align="center">
  Сделано с 💙 для <strong>Decentrathon 5.0</strong> | Трек: inDrive
</p>

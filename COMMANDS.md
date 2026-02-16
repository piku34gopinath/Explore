# Command Reference

This file contains all the necessary commands to start, stop, build, and manage the project.

## Full Stack (Docker Compose)

The easiest way to run the entire application (DB, Redis, Backend, Worker, Frontend) is using Docker Compose.

- **Start all services**:
  ```bash
  docker-compose up -d
  ```
- **Stop all services**:
  ```bash
  docker-compose down
  ```
- **Rebuild and start**:
  ```bash
  docker-compose up -d --build
  ```
- **View logs**:
  ```bash
  docker-compose logs -f
  ```

---

## Frontend Development

Commands for working with the Next.js frontend located in `./frontend`.

- **Install dependencies**:
  ```bash
  cd frontend && npm install
  ```
- **Start development server**:
  ```bash
  cd frontend && npm run dev
  ```
- **Build for production**:
  ```bash
  cd frontend && npm run build
  ```
- **Start production server**:
  ```bash
  cd frontend && npm run start
  ```
- **Run linting**:
  ```bash
  cd frontend && npm run lint
  ```

---

## Backend Development

Commands for working with the FastAPI backend and Celery worker located in `./backend`.

- **Setup virtual environment**:
  ```bash
  cd backend && python3 -m venv venv && source venv/bin/activate
  ```
- **Install dependencies**:
  ```bash
  cd backend && pip install -r requirements.txt
  ```
- **Run API server**:
  ```bash
  cd backend && uvicorn app.main:app --reload --port 8000
  ```
- **Run Celery worker**:
  ```bash
  cd backend && celery -A app.worker.celery_app worker --loglevel=info
  ```

---

## Database & Utilities

Commands for database migrations and other utility scripts.

- **Run migrations**:
  ```bash
  cd backend && python migrate_db.py
  ```
- **Check upload state**:
  ```bash
  python check_upload_state.py
  ```
- **Database audit**:
  ```bash
  python db_audit.py
  ```

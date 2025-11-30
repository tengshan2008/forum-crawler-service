@echo off
REM Forum Crawler Service - Setup Script for Windows

echo ================================
echo Forum Crawler Service Setup
echo ================================

REM Check Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo X Docker is not installed. Please install Docker first.
    exit /b 1
)

echo o Docker is installed

REM Check Docker Compose
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo X Docker Compose is not installed. Please install Docker Compose first.
    exit /b 1
)

echo o Docker Compose is installed

REM Create .env files if they don't exist
echo.
echo Setting up environment files...

if not exist backend\.env (
    copy backend\.env.example backend\.env
    echo o Created backend\.env
)

if not exist crawler\.env (
    copy crawler\.env.example crawler\.env
    echo o Created crawler\.env
)

if not exist frontend\.env (
    copy frontend\.env.example frontend\.env
    echo o Created frontend\.env
)

REM Start Docker Compose
echo.
echo Starting Docker services...
echo.

REM Try new docker compose command first
docker compose -f docker\docker-compose.yml up -d
if errorlevel 1 (
    REM Fall back to docker-compose
    docker-compose -f docker\docker-compose.yml up -d
)

if errorlevel 0 (
    echo.
    echo ================================
    echo o Setup completed successfully!
    echo ================================
    echo.
    echo Services are running at:
    echo   Frontend: http://localhost:3000
    echo   Backend API: http://localhost:5000
    echo   MongoDB: localhost:27017
    echo   Redis: localhost:6379
    echo.
    echo To view logs:
    echo   docker-compose -f docker\docker-compose.yml logs -f
    echo.
    echo To stop services:
    echo   docker-compose -f docker\docker-compose.yml down
) else (
    echo X Failed to start Docker services
    exit /b 1
)

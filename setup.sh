#!/bin/bash

# Forum Crawler Service - Setup Script

echo "================================"
echo "Forum Crawler Service Setup"
echo "================================"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

echo "✓ Docker is installed"

# Check Docker Compose (try both old and new command names)
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✓ Docker Compose is installed"

# Create .env files if they don't exist
echo ""
echo "Setting up environment files..."

if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    echo "✓ Created backend/.env"
fi

if [ ! -f crawler/.env ]; then
    cp crawler/.env.example crawler/.env
    echo "✓ Created crawler/.env"
fi

if [ ! -f frontend/.env ]; then
    cp frontend/.env.example frontend/.env
    echo "✓ Created frontend/.env"
fi

# Start Docker Compose
echo ""
echo "Starting Docker services..."
echo ""

# Try new docker compose command first, fall back to docker-compose
if docker compose version &> /dev/null 2>&1; then
    docker compose -f docker/docker-compose.yml up -d
    COMPOSE_RESULT=$?
else
    docker-compose -f docker/docker-compose.yml up -d
    COMPOSE_RESULT=$?
fi

if [ $COMPOSE_RESULT -eq 0 ]; then
    echo ""
    echo "================================"
    echo "✓ Setup completed successfully!"
    echo "================================"
    echo ""
    echo "Services are running at:"
    echo "  Frontend: http://localhost:3000"
    echo "  Backend API: http://localhost:5000"
    echo "  MongoDB: localhost:27017"
    echo "  Redis: localhost:6379"
    echo ""
    echo "To view logs:"
    echo "  docker compose -f docker/docker-compose.yml logs -f"
    echo "  (or: docker-compose -f docker/docker-compose.yml logs -f)"
    echo ""
    echo "To stop services:"
    echo "  docker compose -f docker/docker-compose.yml down"
    echo "  (or: docker-compose -f docker/docker-compose.yml down)"
else
    echo "❌ Failed to start Docker services"
    exit 1
fi

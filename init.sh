#!/bin/bash

#######################################
# SwenSync Environment Bootstrap Script
# Long-Horizon Engineering Protocol v1.0
#######################################

set -e  # Exit on error

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           SwenSync Environment Bootstrap                      ║"
echo "║       Synchronized Intelligence Platform                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

#######################################
# Step 1: Check Prerequisites
#######################################
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Checking Prerequisites"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    log_success "Node.js installed: $NODE_VERSION"

    # Check version is 20+
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 20 ]; then
        log_warn "Node.js 20+ recommended. Current: $NODE_VERSION"
    fi
else
    log_error "Node.js not found. Please install Node.js 20+"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    log_success "npm installed: $NPM_VERSION"
else
    log_error "npm not found. Please install npm."
    exit 1
fi

# Check git
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    log_success "Git installed: $GIT_VERSION"
else
    log_error "Git not found. Please install git."
    exit 1
fi

# Check Docker (optional)
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    log_success "Docker installed: $DOCKER_VERSION"
else
    log_warn "Docker not found. Optional for containerized deployment."
fi

#######################################
# Step 2: Install Dependencies
#######################################
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Installing Dependencies"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

log_info "Running npm install..."
npm install

log_success "Dependencies installed"

#######################################
# Step 3: Setup Environment Variables
#######################################
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Setting Up Environment Variables"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f .env ]; then
    log_success ".env file already exists"
else
    if [ -f .env.example ]; then
        cp .env.example .env
        log_success "Created .env from .env.example"
        log_warn "Please edit .env and add your OPENAI_API_KEY"
    else
        log_error ".env.example not found. Creating minimal .env..."
        echo "# SwenSync Environment Variables" > .env
        echo "OPENAI_API_KEY=your_api_key_here" >> .env
        echo "PORT=24680" >> .env
        log_warn "Please edit .env and add your OPENAI_API_KEY"
    fi
fi

#######################################
# Step 4: Setup Test Directories
#######################################
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Setting Up Test Directories"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p tests/unit/api
mkdir -p tests/unit/components
mkdir -p tests/unit/hooks
mkdir -p tests/unit/lib
mkdir -p tests/unit/types
mkdir -p tests/unit/signaling
mkdir -p tests/unit/webrtc
mkdir -p tests/unit/audio
mkdir -p tests/unit/ai
mkdir -p tests/e2e/rooms

log_success "Test directories created"

#######################################
# Step 5: Verify Project Structure
#######################################
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 5: Verifying Project Structure"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check required files
REQUIRED_FILES=(
    "PROJECT.md"
    "features_list.json"
    "project-progress.md"
    "package.json"
    "tsconfig.json"
    "next.config.js"
    "tailwind.config.ts"
)

ALL_PRESENT=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        log_success "Found: $file"
    else
        log_error "Missing: $file"
        ALL_PRESENT=false
    fi
done

if [ "$ALL_PRESENT" = true ]; then
    log_success "All required files present"
else
    log_warn "Some files are missing. Check project structure."
fi

#######################################
# Step 6: Type Check
#######################################
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 6: Running Type Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if npm run type-check; then
    log_success "Type check passed"
else
    log_warn "Type check had issues. Please review."
fi

#######################################
# Step 7: Display Protocol Info
#######################################
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 7: Long-Horizon Engineering Protocol"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "This project follows the Long-Horizon Engineering Protocol."
echo ""
echo "Key Files:"
echo "  📄 PROJECT.md        - Project documentation & architecture"
echo "  📋 features_list.json - Feature tracking (source of truth)"
echo "  📝 project-progress.md - Development changelog"
echo ""
echo "Development Cycle:"
echo "  1. Read features_list.json → find first 'passes: false'"
echo "  2. Implement the feature"
echo "  3. Write and run tests"
echo "  4. Update features_list.json → set 'passes: true'"
echo "  5. Log to project-progress.md"
echo "  6. Commit: git commit -m 'feat(FEAT-XXX): description'"
echo ""

#######################################
# Step 8: Show Next Steps
#######################################
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Next Steps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Parse features_list.json to find next feature
if command -v node &> /dev/null; then
    NEXT_FEATURE=$(node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('features_list.json', 'utf8'));
        const next = data.features.find(f => !f.passes);
        if (next) {
            console.log(next.id + ': ' + next.description);
        } else {
            console.log('All features complete!');
        }
    " 2>/dev/null || echo "Unable to parse features_list.json")

    echo ""
    echo "Next Feature to Implement:"
    echo "  🎯 $NEXT_FEATURE"
fi

echo ""
echo "Commands:"
echo "  npm run dev        - Start development server (port 24680)"
echo "  npm run build      - Build for production"
echo "  npm run type-check - Run TypeScript type checking"
echo "  npm run lint       - Run ESLint"
echo "  npm run test       - Run unit tests (when configured)"
echo "  npm run test:e2e   - Run E2E tests (when configured)"
echo ""

#######################################
# Complete
#######################################
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Bootstrap Complete!                              ║"
echo "║                                                               ║"
echo "║  Run 'npm run dev' to start the development server           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

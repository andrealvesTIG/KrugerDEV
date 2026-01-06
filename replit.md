# Friday Report - Project Portfolio Management Application

## Overview

Friday Report is a full-stack project portfolio management application designed for enterprise teams to track projects, portfolios, risks, milestones, and issues. The application follows a Linear + Asana hybrid design approach, emphasizing clean data tables, refined status badges, and professional enterprise-grade UI.

The stack consists of a React frontend with TypeScript, an Express.js backend, PostgreSQL database with Drizzle ORM, and Replit Auth for authentication.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Charts**: Recharts for data visualization
- **Animations**: Framer Motion for smooth transitions
- **Forms**: React Hook Form with Zod validation

The frontend follows a page-based architecture with shared components:
- `client/src/pages/` - Route components (Dashboard, Projects, Portfolios, Issues, Calendar)
- `client/src/components/ui/` - Reusable shadcn/ui components
- `client/src/components/layout/` - Layout components (Sidebar, AppLayout)
- `client/src/hooks/` - Custom hooks for data fetching and authentication

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **API Design**: RESTful API with typed routes defined in `shared/routes.ts`
- **Session Management**: Express sessions with PostgreSQL store
- **Build Tool**: esbuild for server bundling, Vite for client

Key backend files:
- `server/routes.ts` - API route handlers with automatic seeding
- `server/storage.ts` - Data access layer interface
- `server/db.ts` - Database connection setup
- `shared/schema.ts` - Drizzle schema definitions and Zod validators

### Data Model
The application manages five core entities:
1. **Portfolios** - Strategic groupings of projects
2. **Projects** - Individual initiatives with status, health, budget tracking
3. **Risks** - Project risks with probability/impact assessment
4. **Milestones** - Key project milestones with completion tracking
5. **Issues** - Bug/task/enhancement tracking per project

### Shared Code Pattern
The `shared/` directory contains code used by both frontend and backend:
- `shared/schema.ts` - Database schema, TypeScript types, Zod validators
- `shared/routes.ts` - API contract definitions with request/response schemas
- `shared/models/auth.ts` - User and session models for Replit Auth

## External Dependencies

### Database
- **PostgreSQL** - Primary data store
- **Drizzle ORM** - Type-safe database queries and migrations
- **connect-pg-simple** - PostgreSQL session store

### Authentication
- **Replit Auth** - OpenID Connect authentication via Replit
- **Passport.js** - Authentication middleware
- **express-session** - Session management

### UI Components
- **shadcn/ui** - Component library built on Radix UI primitives
- **Radix UI** - Accessible, unstyled UI primitives
- **Lucide React** - Icon library

### Build & Development
- **Vite** - Frontend dev server and bundler
- **esbuild** - Server bundling for production
- **tsx** - TypeScript execution for development

### Data & Utilities
- **date-fns** - Date formatting and manipulation
- **Zod** - Schema validation
- **drizzle-zod** - Generate Zod schemas from Drizzle tables

### Microsoft Project Integration
- **MPXJ** - Open-source Java library for parsing native .mpp files
- Located in `lib/` directory with compiled Java parser
- Supports MPP (native), XML (MSPDI), and CSV formats
- Parsed fields: Task Name, WBS, Start/Finish Date, Duration, % Complete, Outline Level, Summary/Milestone flags
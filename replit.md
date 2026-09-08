# Sistema de Cotizaciones Péza Maquinaria

## Overview

This is a full-stack quotation management system for Péza Maquinaria, a construction equipment rental company. The application provides comprehensive functionality for creating, managing, and tracking quotations, client information, repair orders, and equipment concepts. It's built as a monorepo with a React frontend and Express backend, featuring a PostgreSQL database with Drizzle ORM.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **UI Library**: Radix UI components with Tailwind CSS
- **State Management**: TanStack Query (React Query) for server state
- **Form Handling**: React Hook Form with Zod validation
- **Routing**: Wouter for client-side routing
- **Build Tool**: Vite for development and building
- **PDF Generation**: jsPDF with autoTable for quotation PDFs

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Email Service**: Nodemailer with Zoho SMTP integration
- **File Storage**: Server-side with base64 logo handling
- **API Design**: RESTful endpoints with JSON responses

### Database Design
The system uses PostgreSQL with the following main entities:
- **Clients**: Customer information and statistics
- **Client Projects**: Project organization under clients
- **Quotations**: Main quotation records with customer and project details
- **Quotation Items**: Line items for each quotation
- **Concepts**: Reusable equipment/service catalog
- **Repairs**: Repair order management
- **Repair Items**: Parts and services for repair orders

## Key Components

### Quotation Management
- **Create/Edit Quotations**: Form-based interface with automatic numbering (COT-1001, COT-1002, etc.)
- **Item Management**: Dynamic table for adding equipment/services with quantity, unit price, and subtotal calculations
- **PDF Generation**: Professional quotation PDFs with company branding and social media icons
- **Email Integration**: Send quotations directly to clients via Zoho Mail
- **IVA Calculations**: Automatic 16% IVA (Mexican tax) calculations

### Client & Project Management
- **Client Database**: Complete client information with project and quotation tracking
- **Project Organization**: Group quotations under client projects
- **Statistics Tracking**: Automatic calculation of totals, quotation counts per client
- **Search & Filter**: Advanced search capabilities across clients and projects

### Equipment Catalog
- **Concept Management**: Centralized catalog of equipment and services
- **Default Pricing**: Predefined units and prices for quick quotation creation
- **Categories**: General equipment vs repair-specific concepts
- **Active/Inactive Status**: Flexible catalog management

### Repair Order System
- **Repair Tracking**: Complete repair order management with unique numbering (REP-01, REP-02, etc.)
- **Equipment Details**: Serial numbers, models, and repair manager assignment
- **Service Items**: Parts and labor tracking with separate pricing
- **Status Management**: Track repair progress and completion

### Reporting & Analytics
- **Dashboard**: Overview of business metrics and recent activity
- **Client Reports**: Revenue analysis and client performance metrics
- **Export Functions**: CSV and PDF export capabilities

## Data Flow

### Quotation Creation Flow
1. User accesses quotation form
2. System fetches next available quotation number from database
3. User enters client information and project details
4. User adds items using concept catalog or manual entry
5. System calculates subtotals, IVA, and total automatically
6. User saves quotation to database
7. System updates client statistics
8. Optional: Generate PDF and send via email

### Client Management Flow
1. Create client with basic information
2. System initializes statistics (projects: 0, quotations: 0, amount: 0)
3. Create projects under client for organization
4. As quotations are created, system updates client statistics
5. Dashboard and reports reflect updated client data

### Repair Order Flow
1. Create repair order with equipment details
2. System assigns unique repair number
3. Add repair items using repair-specific concepts
4. Calculate costs and track repair progress
5. Generate repair quotations for client approval

## External Dependencies

### Email Service Integration
- **Provider**: Zoho Mail SMTP
- **Configuration**: SMTP authentication with company email (contacto@pezamaquinaria.com.mx)
- **Features**: HTML email support with PDF attachments

### Database Service
- **Provider**: Neon (PostgreSQL)
- **Connection**: Pooled connections via @neondatabase/serverless
- **Environment**: DATABASE_URL environment variable required

### UI Framework Dependencies
- **Radix UI**: Comprehensive component library for accessibility
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library for consistent iconography

## Deployment Strategy

### Development Environment
- **Runtime**: Node.js 20
- **Database**: PostgreSQL 16
- **Development Server**: Vite dev server with HMR
- **API Server**: Express with tsx for TypeScript execution

### Production Build
- **Frontend Build**: Vite builds to `dist/public`
- **Backend Build**: esbuild bundles server code to `dist/index.js`
- **Deployment Target**: Autoscale deployment on Replit
- **Port Configuration**: Internal port 5000, external port 80

### Environment Configuration
- **DATABASE_URL**: PostgreSQL connection string (required)
- **NODE_ENV**: production/development flag
- **Email Credentials**: Embedded in server configuration

### Database Management
- **Migrations**: Drizzle Kit for schema migrations
- **Schema Location**: `shared/schema.ts` for type sharing
- **Seeding**: Sample data seeding via `db/seed.ts`

### Dev vs Production Data (refrescar copia de desarrollo)
- La app publicada guarda los datos reales en Neon (`NEON_DATABASE_URL`, tratar como solo lectura).
- El entorno de desarrollo usa `DATABASE_URL`, que es una copia que se desactualiza con el tiempo.
- Para refrescar la copia de desarrollo con los datos reales, correr en la Shell:
  `bash scripts/refresh-dev-db.sh`
  El script exporta producción con `pg_dump` (solo lectura), borra y restaura la base de desarrollo, y muestra una verificación rápida (conteo de reparaciones y folio máximo).
- Nunca apuntar `DATABASE_URL` a producción; el script aborta si ambas URLs coinciden.

## Changelog
- December 22, 2025. **Object Storage Implementation for Repair Images**
  - Configured Replit Object Storage bucket for image management
  - Changed image storage from base64 (in database) to URLs (in Object Storage)
  - Updated RepairForm.tsx to upload images directly to Object Storage
  - Added upload progress indicator with loading state
  - Images now stored efficiently in Object Storage instead of database
  - Supports JPG, PNG, WebP formats for optimal compression
  - Added helper functions in client/src/lib/object-storage.ts
  - New endpoints: POST /api/upload-image and POST /api/delete-image
  - Result: Better performance, scalability, and reduced database size
- December 5, 2025. **Performance Optimization: Eliminated N+1 queries and reduced database payload size**
  - Backend: Implemented `getClientByIdOptimized()` to avoid loading unnecessary quotation items
  - Backend: Implemented `getReportsByClientIdWithDetails()` to fetch reports with items and payments in a single optimized query
  - Frontend: Added memoization in ClientDetail.tsx using `useMemo` for `reportsByProject` and `accountStats` to prevent unnecessary recalculations
  - Result: Dramatic performance improvement on ClientDetail page loading, especially for clients with many reports
- November 17, 2025. Optimized ClientDetail page for mobile devices (<450px) - implemented Grid 2x2 layout for activity tabs (Proyectos/Cotizaciones/Reportes/Estado), reorganized project cards with two-row button layout, increased header padding (pb-6) for complete tab visibility
- November 17, 2025. Enhanced account statement PDF with ABONOS column - compacted column widths (FOLIO: 18mm, OBRA/CONCEPTO: 25mm, SUBTOT./IMPORTE: 18mm), added ABONOS column (20mm) showing payment amounts in pesos with bidirectional sync (paymentStatus "pagado" = 100% of importe), abbreviated SUBTOTAL to SUBTOT. for space optimization
- September 12, 2025. Fixed critical form validation issues in ReportForm.tsx that were preventing report creation - resolved TypeScript errors, fixed default values causing validation failures, and added debug logging for troubleshooting
- January 17, 2025. Added auto-fill functionality for report creation from project context - when clicking "Crear Reporte" from a project, the project name automatically fills the "OBRA" field in report form and all concept items
- January 17, 2025. Updated Clients page metrics - changed "Total Facturado" to "Total Cotizado" and added new "Total en Reportes" card with proper API integration
- January 17, 2025. Implemented complete report management functionality with three action buttons (Ver/PDF/Eliminar) in ClientDetail page
- January 17, 2025. Added PDF generation for reports with perfect footer alignment (Página 1 de 1 centered, social networks aligned horizontally)
- January 17, 2025. Created report deletion functionality with confirmation dialog and proper cache invalidation
- January 17, 2025. Created ProjectDetail page for viewing all project reports/work history with corporate styling
- January 17, 2025. Added "Crear Reporte" button to project cards in ClientDetail page
- January 17, 2025. Fixed PDF layout spacing for "Dirección General" section to prevent overlap with page footer
- January 17, 2025. Implemented client name autocomplete in quotation form with intelligent dropdown suggestions
- January 16, 2025. Implemented concept-based PDF pagination (Terms and Conditions move to page 2 only if >6 concepts)
- January 16, 2025. Applied comprehensive Peza Maquinaria corporate styling to ClientDetail page
- January 16, 2025. Implemented intelligent PDF pagination for Terms and Conditions
- January 16, 2025. Added client quotations display in ClientDetail page
- January 16, 2025. Applied Peza Maquinaria corporate styling to Clients page
- January 16, 2025. Added salesperson field to quotations
- June 16, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.
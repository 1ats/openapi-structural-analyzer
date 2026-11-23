# OpenAPI Structural Analyzer

**OpenAPI Structural Analyzer** is a Node.js-based tool designed for collecting, validating, and extracting structural information from OpenAPI specification documents.

The project aims to analyze OpenAPI documents obtained from different sources, identify structural elements defined in the specifications, and store the extracted data in a PostgreSQL database.

The tool consolidates information from multiple documents into an organized structure, enabling quantitative analyses of the usage and distribution of objects and elements that make up OpenAPI specifications.

## Table of Contents

- [Features](#features)
- [Technologies](#technologies)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Database Configuration](#database-configuration)
- [Execution and Processing Workflow](#execution-and-processing-workflow)
- [Data Sources](#data-sources)
- [License](#license)

## Features

The main features of the project include:

- **Document Collection:** Retrieves OpenAPI specification documents from different sources, including APIs.guru and GitHub.
- **Document Validation:** Validates documents using a specialized library for parsing and validating OpenAPI specifications.
- **Version Identification:** Identifies the OpenAPI Specification (OAS) versions declared in the documents.
- **Component Extraction:** Identifies and extracts structural elements from OpenAPI documents according to the rules implemented in the tool.
- **Information Normalization:** Applies normalization rules to the names of selected extracted elements.
- **Data Storage:** Stores collected and extracted information in a PostgreSQL database.
- **Report Generation:** Provides statistical results about the processed dataset, including OAS version distribution and the absolute and relative frequencies of identified objects and components.

## Technologies

The project uses the following technologies and libraries:

| Technology | Description |
|---|---|
| Node.js | JavaScript runtime environment |
| Express.js | Framework for developing the web application |
| PostgreSQL | Relational database management system |
| Axios | Library for making HTTP requests |
| @readme/openapi-parser | Library for parsing and validating OpenAPI documents |
| js-yaml | Library for processing YAML documents |
| dotenv | Environment variable management |
| Nodemon | Tool for automatically restarting the application during development |

## Project Structure

The project directory structure is organized as follows:

*The complete directory structure will be documented according to the final organization of the project's directories and files.*

## Requirements

The following software and resources are required to run the project:

- Node.js.
- npm (Node.js package manager).
- PostgreSQL installed and running.
- Internet access to collect documents from external sources.
- A GitHub Personal Access Token with the appropriate permissions for collecting specifications from public repositories.

## Installation

Clone the repository:

```bash
git clone https://github.com/1ats/openapi-structural-analyzer.git
```

Navigate to the project directory:

```bash
cd openapi-structural-analyzer
```

### Installing Dependencies

To install all dependencies defined in the project, run:

```bash
npm install
```

Alternatively, dependencies can be installed individually.

**Production dependencies:**

```bash
npm install @readme/openapi-parser
npm install axios
npm install dotenv
npm install express
npm install js-yaml
npm install pg
```

**Development dependency:**

```bash
npm install --save-dev nodemon
```

The dependencies serve the following purposes:

- `@readme/openapi-parser`: Parses and validates OpenAPI documents.
- `axios`: Performs HTTP requests.
- `dotenv`: Manages environment variables.
- `express`: Develops the web application and exposes its API endpoints.
- `js-yaml`: Processes YAML documents.
- `pg`: Connects to the PostgreSQL database.
- `nodemon`: Automatically restarts the application during development.

## Environment Configuration

The project uses environment variables to configure execution parameters and access credentials.

Create a copy of the `.env.example` file and name it `.env`.

**Linux or macOS:**

```bash
cp .env.example .env
```

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

After creating the file, configure the environment variables according to your local setup.

> **Important:** The `.env` file contains local configuration settings and access credentials. Therefore, it must not be committed to the repository. The `.env.example` file provides a configuration template without actual credentials.

## Database Configuration

The PostgreSQL connection settings are defined in the following file:

```text
src/config/database.js
```

The connection settings include the parameters required to establish communication between the application and the database.

Depending on the project configuration, these settings can be defined directly in this file or through environment variables.

Before running operations that depend on the database, ensure that PostgreSQL is running and that the database has been properly configured.

## Execution and Processing Workflow

The document processing workflow is organized into several stages, from data collection to report generation.

### 1. Specification Collection

The tool provides endpoints for collecting OpenAPI specification documents from two different sources.

**The collection process runs in the background (asynchronously)**, allowing document retrieval and storage operations to proceed without requiring the HTTP request to wait for the entire collection process to finish.

**APIs.guru**

```http
POST http://localhost:3000/api/v1/ingestion/fetch-guru
```

**GitHub**

```http
POST http://localhost:3000/api/v1/ingestion/fetch-github
```

Each endpoint initiates the document collection process from its respective source. The retrieved documents are stored for subsequent validation and processing.

### 2. Clearing Collected Data

To clear the stored data and restart the ingestion process, the following endpoint is available:

```http
DELETE http://localhost:3000/api/v1/ingestion/clear
```

> **Warning:** This operation clears the tables used by the ingestion process. It should only be performed when there is a need to restart data collection and processing.

### 3. Specification Validation

After collection, the documents can be submitted for validation using the following endpoint:

```http
POST http://localhost:3000/api/v1/processing/validate-specs
```

This stage validates the collected documents and identifies those that meet the validation criteria implemented in the tool.

### 4. Component Extraction

After validation, the tool extracts the structural elements identified in the OpenAPI documents.

This stage applies specific rules to identify and normalize the elements defined in the specifications, storing the extracted results in the PostgreSQL database.

### 5. Report Generation

After processing, the results can be retrieved through the reporting endpoints.

#### Statistical Summary

```http
GET http://localhost:3000/api/v1/reports/summary
```

Provides a statistical overview of the processed dataset, including:

- Number of identified providers.
- Total number of collected specifications.
- Distribution of OpenAPI Specification (OAS) versions.
- Validation success and failure rates.

#### Object and Component Frequencies

```http
GET http://localhost:3000/api/v1/reports/patterns
```

Provides the absolute and relative frequency results of the objects and components identified across the document dataset.

The report also supports filtering by component type, such as `SCHEMA` and `SECURITY_SCHEME`.

## Data Sources

The project collects OpenAPI specification documents from different sources:

- **APIs.guru:** A public catalog of Web API specifications.
- **GitHub:** Public repositories containing OpenAPI specification documents.

The collected documents undergo validation and subsequent structural information extraction, according to the rules implemented in the tool.

Using multiple data sources allows the project to gather documents from different providers and increase the diversity of the analyzed specification dataset.

## License

This project is currently identified as using the ISC license in its `package.json` file.

The terms governing the use, distribution, and modification of the source code must comply with the license made available in the repository root.

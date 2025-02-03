# My TypeScript Node Prisma App

This project is a simple application built with TypeScript, Node.js, and Prisma. It serves as a starting point for building a RESTful API with a database connection.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Contributing](#contributing)
- [License](#license)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/my-ts-node-prisma-app.git
   ```

2. Navigate to the project directory:
   ```
   cd my-ts-node-prisma-app
   ```

3. Install the dependencies:
   ```
   npm install
   ```

4. Set up the database:
   - Update the `DATABASE_URL` in the `.env` file with your database connection string.
   - Run the Prisma migrations:
     ```
     npx prisma migrate dev --name init
     ```

## Usage

To start the application, run:
```
npm run start
```

The server will be running on `http://localhost:3000`.

## Database Schema

The database schema is defined in the `prisma/schema.prisma` file. You can modify this file to add or change your data models.

## API Endpoints

The application exposes several API endpoints. You can find the details in the `src/routes/index.ts` file.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
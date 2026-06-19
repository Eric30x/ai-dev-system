/**
 * Prisma Client — 单例模式
 */

const { PrismaClient } = require("@prisma/client");

let prisma;

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["query"] : [],
    });
  }
  return prisma;
}

module.exports = { getPrisma };

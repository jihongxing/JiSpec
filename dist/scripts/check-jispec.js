"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const validator_1 = require("../tools/jispec/validator");
async function main() {
    const repoRoot = node_path_1.default.resolve(__dirname, "..");
    const result = (0, validator_1.validateRepository)(repoRoot);
    console.log(result.renderText());
    return result.ok ? 0 : 1;
}
void main().then((code) => {
    process.exitCode = code;
});

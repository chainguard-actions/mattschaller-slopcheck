interface ScanResult {
    file: string;
    line: number;
    command: string;
    packages: string[];
}
interface ValidationResult {
    name: string;
    exists: boolean;
    error?: string;
    httpStatus?: number;
    isSecurityHold?: boolean;
}
interface Finding {
    package: string;
    status: 'not_found' | 'security_hold' | 'error';
    locations: Array<{
        file: string;
        line: number;
        command: string;
    }>;
}
interface SlopcheckResult {
    version: string;
    scanned: number;
    packages: {
        total: number;
        valid: number;
        notFound: number;
        securityHold: number;
        errors: number;
    };
    findings: Finding[];
}
interface CLIOptions {
    paths: string[];
    json: boolean;
    concurrency: number;
    ignore: string[];
    noSecurityHold: boolean;
}

declare function scanPaths(paths: string[]): ScanResult[];

declare function extractPackageNames(command: string): string[];

declare function validatePackages(names: string[], options?: {
    concurrency?: number;
}): Promise<ValidationResult[]>;

declare function buildResult(scanResults: ScanResult[], validationResults: ValidationResult[], scannedFileCount: number, options?: {
    noSecurityHold?: boolean;
}): SlopcheckResult;
declare function formatText(result: SlopcheckResult): string;
declare function formatJson(result: SlopcheckResult): string;
declare function formatGitHubActions(result: SlopcheckResult): string;

export { type CLIOptions, type Finding, type ScanResult, type SlopcheckResult, type ValidationResult, buildResult, extractPackageNames, formatGitHubActions, formatJson, formatText, scanPaths, validatePackages };

/**
 * gRPC Client Service for communicating with importers
 * Supports generic importer service interface
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import fs from 'fs';

export interface ImporterClientConfig {
  host: string;
  port: number;
  importerName: string; // e.g., 'coinbase'
}

export interface ImportStatus {
  sources: { [key: string]: SourceStatus };
  is_running: boolean;
  last_updated: string;
}

export interface SourceStatus {
  is_running: boolean;
  last_run_time: string;
  last_error: string;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
}

export interface ImporterConfig {
  settings: { [key: string]: string };
}

export class GrpcClientService {
  private clients: Map<string, any> = new Map();
  private packageDefinitions: Map<string, any> = new Map();

  /**
   * Load proto file and create client
   */
  private async loadProto(protoPath: string, packageName: string): Promise<any> {
    if (!fs.existsSync(protoPath)) {
      throw new Error(`Proto file not found: ${protoPath}`);
    }

    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    return protoDescriptor[packageName];
  }

  /**
   * Get or create a gRPC client for an importer
   */
  private async getClient(config: ImporterClientConfig): Promise<any> {
    const clientKey = `${config.importerName}:${config.host}:${config.port}`;

    if (this.clients.has(clientKey)) {
      return this.clients.get(clientKey);
    }

    // Load proto file based on importer name
    // Proto files should be accessible from the project root or configured via environment
    // For coinbase, we'll try multiple paths
    let protoPath: string;
    
    // Try relative to project root (for development)
    const projectRoot = path.join(__dirname, '../../../../');
    const defaultPath = path.join(projectRoot, `apps/importers/${config.importerName}/proto/importer_config.proto`);
    
    // Try environment variable first
    const envProtoPath = process.env[`${config.importerName.toUpperCase()}_IMPORTER_PROTO_PATH`];
    
    if (envProtoPath && fs.existsSync(envProtoPath)) {
      protoPath = envProtoPath;
    } else if (fs.existsSync(defaultPath)) {
      protoPath = defaultPath;
    } else {
      throw new Error(
        `Proto file not found for ${config.importerName}. ` +
        `Set ${config.importerName.toUpperCase()}_IMPORTER_PROTO_PATH environment variable ` +
        `or ensure proto file exists at: ${defaultPath}`
      );
    }

    const importerProto = await this.loadProto(protoPath, `${config.importerName}_importer`);
    const ImporterService = importerProto.ImporterService;

    const client = new ImporterService(
      `${config.host}:${config.port}`,
      grpc.credentials.createInsecure()
    );

    this.clients.set(clientKey, client);
    return client;
  }

  /**
   * Start an import for a specific source
   */
  async startImport(config: ImporterClientConfig, source: string, userId?: string): Promise<{ success: boolean; message: string }> {
    try {
      const client = await this.getClient(config);

      return new Promise((resolve, reject) => {
        client.StartImport(
          { source, user_id: userId || '' },
          (error: grpc.ServiceError | null, response: any) => {
            if (error) {
              reject(new Error(`gRPC error: ${error.message}`));
            } else {
              resolve({
                success: response.success,
                message: response.message,
              });
            }
          }
        );
      });
    } catch (error: any) {
      throw new Error(`Failed to start import: ${error.message}`);
    }
  }

  /**
   * Stop an import for a specific source
   */
  async stopImport(config: ImporterClientConfig, source: string): Promise<{ success: boolean; message: string }> {
    try {
      const client = await this.getClient(config);

      return new Promise((resolve, reject) => {
        client.StopImport(
          { source },
          (error: grpc.ServiceError | null, response: any) => {
            if (error) {
              reject(new Error(`gRPC error: ${error.message}`));
            } else {
              resolve({
                success: response.success,
                message: response.message,
              });
            }
          }
        );
      });
    } catch (error: any) {
      throw new Error(`Failed to stop import: ${error.message}`);
    }
  }

  /**
   * Get status of an importer
   */
  async getStatus(config: ImporterClientConfig, userId?: string): Promise<ImportStatus> {
    try {
      const client = await this.getClient(config);

      return new Promise((resolve, reject) => {
        client.GetStatus(
          { user_id: userId || '' },
          (error: grpc.ServiceError | null, response: any) => {
            if (error) {
              reject(new Error(`gRPC error: ${error.message}`));
            } else {
              const status = response.status;
              const sources: { [key: string]: SourceStatus } = {};

              // Convert protobuf map to JavaScript object
              for (const [key, value] of Object.entries(status.sources || {})) {
                sources[key] = {
                  is_running: (value as any).is_running || false,
                  last_run_time: (value as any).last_run_time || '',
                  last_error: (value as any).last_error || '',
                  total_runs: (value as any).total_runs || 0,
                  successful_runs: (value as any).successful_runs || 0,
                  failed_runs: (value as any).failed_runs || 0,
                };
              }

              resolve({
                sources,
                is_running: status.is_running || false,
                last_updated: status.last_updated || '',
              });
            }
          }
        );
      });
    } catch (error: any) {
      throw new Error(`Failed to get status: ${error.message}`);
    }
  }

  /**
   * Get configuration of an importer
   */
  async getConfig(config: ImporterClientConfig, userId?: string): Promise<ImporterConfig> {
    try {
      const client = await this.getClient(config);

      return new Promise((resolve, reject) => {
        client.GetConfig(
          { user_id: userId || '' },
          (error: grpc.ServiceError | null, response: any) => {
            if (error) {
              reject(new Error(`gRPC error: ${error.message}`));
            } else {
              const configProto = response.config;
              resolve({
                settings: {
                  coinbase_api_key: configProto.coinbase_api_key || '',
                  coinbase_api_secret: configProto.coinbase_api_secret || '',
                  coinbase_pro_accounts_folder_path: configProto.coinbase_pro_accounts_folder_path || '',
                  coinbase_pro_fills_folder_path: configProto.coinbase_pro_fills_folder_path || '',
                  ...(configProto.settings || {}),
                },
              });
            }
          }
        );
      });
    } catch (error: any) {
      throw new Error(`Failed to get config: ${error.message}`);
    }
  }

  /**
   * Set configuration of an importer
   */
  async setConfig(config: ImporterClientConfig, importerConfig: ImporterConfig, userId?: string): Promise<{ success: boolean; message: string }> {
    try {
      const client = await this.getClient(config);

      return new Promise((resolve, reject) => {
        const configProto = {
          user_id: userId || '',
          config: {
            coinbase_api_key: importerConfig.settings?.coinbase_api_key || '',
            coinbase_api_secret: importerConfig.settings?.coinbase_api_secret || '',
            coinbase_pro_accounts_folder_path: importerConfig.settings?.coinbase_pro_accounts_folder_path || '',
            coinbase_pro_fills_folder_path: importerConfig.settings?.coinbase_pro_fills_folder_path || '',
            settings: importerConfig.settings || {},
          },
        };

        client.SetConfig(
          configProto,
          (error: grpc.ServiceError | null, response: any) => {
            if (error) {
              reject(new Error(`gRPC error: ${error.message}`));
            } else {
              resolve({
                success: response.success,
                message: response.message,
              });
            }
          }
        );
      });
    } catch (error: any) {
      throw new Error(`Failed to set config: ${error.message}`);
    }
  }

  /**
   * Close all client connections
   */
  close(): void {
    this.clients.forEach((client) => {
      client.close();
    });
    this.clients.clear();
    this.packageDefinitions.clear();
  }
}


// Query result types
export interface SteampipeResult<T = Record<string, unknown>> {
  rows: T[];
  error?: string;
}

export interface BatchQueryRequest {
  queries: Record<string, string>;
}

export interface BatchQueryResponse {
  [key: string]: SteampipeResult;
}

// EC2
export interface EC2Instance {
  instance_id: string;
  instance_state: string;
  instance_type: string;
  public_ip_address?: string;
  private_ip_address?: string;
  vpc_id?: string;
  subnet_id?: string;
  launch_time: string;
  tags?: Record<string, string>;
  title?: string;
  region: string;
}

// S3
export interface S3Bucket {
  name: string;
  region: string;
  creation_date: string;
  versioning: string;
  logging: string;
  acl?: string;
  bucket_policy_is_public?: boolean;
}

// RDS
export interface RDSInstance {
  db_instance_identifier: string;
  engine: string;
  engine_version: string;
  db_instance_class: string;
  status: string;
  allocated_storage: number;
  multi_az: boolean;
  region: string;
}

// Lambda
export interface LambdaFunction {
  function_name: string;
  runtime: string;
  memory_size: number;
  timeout: number;
  handler: string;
  last_modified: string;
  code_size: number;
  region: string;
}

// VPC
export interface VPC {
  vpc_id: string;
  cidr_block: string;
  state: string;
  is_default: boolean;
  tags?: Record<string, string>;
  title?: string;
  region: string;
}

export interface Subnet {
  subnet_id: string;
  vpc_id: string;
  cidr_block: string;
  availability_zone: string;
  state: string;
  map_public_ip_on_launch: boolean;
}

export interface SecurityGroup {
  group_id: string;
  group_name: string;
  vpc_id: string;
  description: string;
}

// IAM
export interface IAMUser {
  name: string;
  user_id: string;
  arn: string;
  create_date: string;
  mfa_enabled: boolean;
  password_last_used?: string;
}

// CloudWatch
export interface CloudWatchAlarm {
  name: string;
  namespace: string;
  metric_name: string;
  state_value: string;
  state_reason?: string;
  actions_enabled: boolean;
}

// ECS
export interface ECSCluster {
  cluster_name: string;
  cluster_arn: string;
  status: string;
  running_tasks_count: number;
  active_services_count: number;
  registered_container_instances_count: number;
}

// DynamoDB
export interface DynamoDBTable {
  name: string;
  status: string;
  item_count: number;
  table_size_bytes: number;
  billing_mode: string;
  region: string;
}

// Cost
export interface CostRecord {
  period_start: string;
  period_end: string;
  service?: string;
  blended_cost_amount: number;
  blended_cost_unit: string;
}

// K8s
export interface K8sNode {
  name: string;
  status: string;
  capacity_cpu: string;
  capacity_memory: string;
  allocatable_cpu: string;
  allocatable_memory: string;
  creation_timestamp: string;
}

export interface K8sPod {
  name: string;
  namespace: string;
  phase: string;
  node_name: string;
  creation_timestamp: string;
  container_name?: string;
  container_image?: string;
}

export interface K8sDeployment {
  name: string;
  namespace: string;
  replicas: number;
  available_replicas: number;
  ready_replicas: number;
  creation_timestamp: string;
}

export interface K8sService {
  name: string;
  namespace: string;
  type: string;
  cluster_ip: string;
  external_ip?: string;
  port?: string;
  protocol?: string;
}

export interface K8sEvent {
  reason: string;
  message: string;
  type: string;
  namespace: string;
  involved_object_kind: string;
  involved_object_name: string;
  last_timestamp: string;
}

// Security / Trivy
export interface TrivyVulnerability {
  vulnerability_id: string;
  pkg_name: string;
  installed_version: string;
  fixed_version: string;
  severity: string;
  title: string;
  artifact_name: string;
  artifact_type: string;
}

// Stats
export interface StatItem {
  label: string;
  value: string | number;
  icon?: string;
  color?: string;
  change?: string;
}

// Chart data
export interface ChartDataItem {
  name: string;
  value: number;
  color?: string;
}

// Resource status
export type ResourceStatus =
  | 'running' | 'stopped' | 'pending' | 'terminated'
  | 'active' | 'inactive' | 'available' | 'error'
  | 'healthy' | 'unhealthy' | 'ready' | 'not_ready'
  | 'ok' | 'alarm' | 'insufficient_data';

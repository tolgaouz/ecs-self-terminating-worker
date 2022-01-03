require("dotenv").config();
import { Duration, Stack, StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import * as path from "path";
import { ManagedPolicy } from "aws-cdk-lib/aws-iam";

export class EcsSelfTerminatingWorkerStack extends Stack {
  private NAME = "SelfTerminatingWorker";
  private GPU_ENABLED = Number(process.env["GPU_ENABLED"]) === 1 || 0;
  private ARM_INSTANCE = Number(process.env["ARM_INSTANCE"]) === 1 || 0;
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, `VPC`, { maxAzs: 2 });
    let hardwareType: ecs.AmiHardwareType = ecs.AmiHardwareType.STANDARD;
    if (Boolean(this.GPU_ENABLED)) hardwareType = ecs.AmiHardwareType.GPU;
    if (Boolean(this.ARM_INSTANCE)) hardwareType = ecs.AmiHardwareType.ARM;

    const asg = new autoscaling.AutoScalingGroup(this, "ASG", {
      instanceType: new ec2.InstanceType(process.env.EC2_INSTANCE_TYPE!),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(hardwareType),
      desiredCapacity: 0,
      minCapacity: 0,
      maxCapacity: 1,
      vpc,
    });

    const cluster = new ecs.Cluster(this, `ECSCluster`, { vpc });
    const capacityProvider = new ecs.AsgCapacityProvider(this, "asgcprovider", {
      autoScalingGroup: asg,
      capacityProviderName: `${this.NAME}_AsgCapacityProvider`,
    });
    cluster.addAsgCapacityProvider(capacityProvider);

    const logging = new ecs.AwsLogDriver({ streamPrefix: this.NAME });

    const queue = new sqs.Queue(this, `Queue`, {
      visibilityTimeout: Duration.hours(2),
      retentionPeriod: Duration.days(1),
      deliveryDelay: Duration.seconds(0),
      receiveMessageWaitTime: Duration.seconds(0),
    });

    const taskDef = new ecs.Ec2TaskDefinition(this, `DefaultTaskDefinition`);

    taskDef.addContainer(`ECRContainer`, {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, "worker")),
      logging,
      environment: {
        QUEUE_URL: queue.queueUrl,
        AUTOSCALING_GROUP_NAME: asg.autoScalingGroupName,
        CLUSTER_NAME: cluster.clusterName,
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID!,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY!,
        AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION!,
      },
      memoryReservationMiB: parseInt(
        process.env.ECS_TASK_DEFINITON_MEMORY_SOFT_LIMIT || "2048"
      ),
      command: ["python", "run.py"],
    });

    const lambdaRole = new iam.Role(this, "Role", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "Lambda role for Self Terminating Worker",
    });

    queue.grantConsumeMessages(lambdaRole);

    const ManagedPolicies = [
      "CloudWatchLogsFullAccess",
      "AmazonECS_FullAccess",
      "AutoScalingFullAccess",
    ];

    ManagedPolicies.forEach((managedPolicy) =>
      lambdaRole.addManagedPolicy(
        ManagedPolicy.fromAwsManagedPolicyName(managedPolicy)
      )
    );

    const taskStarterLambda = new lambda.Function(this, `TaskChecker`, {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: "task_starter.lambda_handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "lambdas")),
      environment: {
        QUEUE_URL: queue.queueUrl,
        AUTOSCALING_GROUP_NAME: asg.autoScalingGroupName,
        ECS_CLUSTER_NAME: cluster.clusterName,
        ECS_TASK_DEFINITION_NAME: taskDef.taskDefinitionArn,
      },
      role: lambdaRole,
      timeout: Duration.minutes(15),
    });

    const rate = process.env.CRON_RATE
      ? process.env.CRON_RATE.toLowerCase().split("_").join(" ")
      : "6 hours";

    const rule = new events.Rule(this, "Rule", {
      schedule: events.Schedule.expression(`rate(${rate})`),
    });

    rule.addTarget(new targets.LambdaFunction(taskStarterLambda));
  }
}

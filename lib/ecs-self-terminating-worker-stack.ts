import { Duration, Stack, StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import * as path from "path";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EcsSelfTerminatingWorkerStack extends Stack {
  private NAME = "SelfTerminatingWorker";
  private GPU_ENABLED = process.env["GPU_ENABLED"] || 0;
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, `${this.NAME}_VPC`, { maxAzs: 2 });
    let hardwareType: ecs.AmiHardwareType = ecs.AmiHardwareType.STANDARD;

    if (Boolean(this.GPU_ENABLED)) hardwareType = ecs.AmiHardwareType.GPU;

    const cluster = new ecs.Cluster(this, `${this.NAME}_ECS_CLUSTER`, { vpc });
    cluster.addCapacity(`${this.NAME}_ASG`, {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(hardwareType),
      desiredCapacity: 0,
    });

    // create a task definition with CloudWatch Logs
    const logging = new ecs.AwsLogDriver({ streamPrefix: this.NAME });

    const queue = new sqs.Queue(this, `${this.NAME}_Queue`, {
      visibilityTimeout: Duration.hours(2),
      retentionPeriod: Duration.days(1),
      deliveryDelay: Duration.seconds(0),
      receiveMessageWaitTime: Duration.seconds(0),
    });

    const taskDef = new ecs.Ec2TaskDefinition(
      this,
      `${this.NAME}_Default_Task_Definition`
    );
    taskDef.addContainer(`${this.NAME}_ECR_Container`, {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, "worker")),
      logging,
      environment: {
        QUEUE_URL: queue.queueUrl,
        AUTOSCALING_GROUP_NAME:
          cluster.autoscalingGroup?.autoScalingGroupName || "",
        CLUSTER_NAME: cluster.clusterName,
      },
    });

    const taskStarterLambda = new lambda.Function(
      this,
      `${this.NAME}_Task_Checker`,
      {
        runtime: lambda.Runtime.PYTHON_3_9,
        handler: "task_starter.lambda_handler",
        code: lambda.Code.fromAsset(path.join(__dirname, "lambdas")),
      }
    );
    
    // Add environment variables
    taskStarterLambda.addEnvironment("QUEUE_URL", queue.queueUrl);
    taskStarterLambda.addEnvironment(
      "AUTOSCALING_GROUP_NAME",
      cluster.autoscalingGroup?.autoScalingGroupName || ""
    );
    taskStarterLambda.addEnvironment("ECS_CLUSTER_NAME", cluster.clusterName);
    taskStarterLambda.addEnvironment(
      "ECS_TASK_DEFINITON_NAME",
      `${this.NAME}_Default_Task_Definition`
    );
  }
}

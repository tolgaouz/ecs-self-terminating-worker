import { Stack, StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";
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

    const taskDef = new ecs.Ec2TaskDefinition(
      this,
      `${this.NAME}_Default_Task_Definition`
    );
    taskDef.addContainer("AppContainer", {
      image: ecs.ContainerImage.fromAsset()
      memoryLimitMiB: 512,
      logging,
    });
  }
}

import json
import boto3
import os
import time

client_autoscaling = boto3.client('autoscaling')
client_ecs = boto3.client("ecs")
client_sqs = boto3.client("sqs")

def check_cluster(queue_url,autoscaling_group_name,cluster_name,task_def):
    
    queue = client_sqs.get_queue_attributes(QueueUrl=queue_url,AttributeNames=['ApproximateNumberOfMessages'])
    print(queue)
    if int(queue.get("Attributes",{}).get("ApproximateNumberOfMessages",0)) < 1:
        return queue
    
    running_tasks = client_ecs.list_tasks(cluster=cluster_name)["taskArns"]
    registered_instances = client_ecs.describe_clusters(clusters=[cluster_name])["clusters"][0]["registeredContainerInstancesCount"]
    
    if len(running_tasks) > 0:
        print("Some tasks are still running. Passing this iteration.")
        print("Running tasks:",running_tasks)
        return None
    
    if len(running_tasks)==0 and registered_instances>0:
        print("There are no tasks running but instance is up. Closing instance now.")
        client_autoscaling.set_desired_capacity(AutoScalingGroupName=autoscaling_group_name,DesiredCapacity=0)
    
    if registered_instances == 0 and len(running_tasks)==0:
        print("ECS was idle. Creating an instance.")
        client_autoscaling.set_desired_capacity(AutoScalingGroupName=autoscaling_group_name,DesiredCapacity=1)
        # Now let's poll until the instance is up
        print("Polling until instace is up & registered to ECS")
        t = 0
        while registered_instances==0 and t<300:
            registered_instances = client_ecs.describe_clusters(clusters=[cluster_name])["clusters"][0]["registeredContainerInstancesCount"]
            if registered_instances>0:
                break
            else:
                t += 10
                time.sleep(10)
        # EC2 instance is up, lets places tasks
        print("Instance is up, placing tasks")
        # Run scoring task
        client_ecs.run_task(cluster=cluster_name,launchType="EC2",
            taskDefinition=task_def)
        print("Tasks are placed.")
    return running_tasks
    
def lambda_handler(*args):
    
    check_cluster("https://sqs.us-east-1.amazonaws.com/632956674143/ProsCons-Queue",
                "EC2ContainerService-pros-cons-task-EcsInstanceAsg-SEVBYK4XRVQR",
                "pros-cons-task",
                "pros_cons")    
    return
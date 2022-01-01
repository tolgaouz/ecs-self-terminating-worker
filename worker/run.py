import json
import time
import datetime
import os
import boto3

client = boto3.client("sqs")
client_ecs = boto3.client('ecs')
client_autoscaling = boto3.client('autoscaling')
QueueUrl = os.environ.get("QUEUE_URL")
AutoScalingGroupName = os.environ.get("AUTOSCALING_GROUP_NAME")
cluster_name = os.environ.get("CLUSTER_NAME")

def get_messages():
	sqs = boto3.resource("sqs")

	resp = client.receive_message(QueueUrl=QueueUrl,MaxNumberOfMessages=1)

	if resp['ResponseMetadata']['HTTPStatusCode']!=200:
		raise Exception("SQS returned response other than 200. eSlug: unsuccessful-request")
	
	return resp.get("Messages",[])
    
def run():
	msgs = get_messages()
	while len(msgs)>0:
		for msg in msgs:
			try:
				data = json.loads(msg["Body"])
        print(data)
				# Some worker process here
				client.delete_message(QueueUrl=QueueUrl,ReceiptHandle=msg["ReceiptHandle"])
			except Exception as e:
				print("Can not process messageId:",msg["MessageId"],"Date:",datetime.datetime.now(),"eSlug: msg-failed","Error",str(e))
				print("msgBody:",msg["Body"])
				continue
		msgs = get_messages()

  # Check if more than one task is running, which shouldn't be the case anytime 
  # for this use-case. We run one task per cluster.
  # If so, kill all the tasks.
	running_tasks = client_ecs.list_tasks(cluster=cluster_name)["taskArns"]
	if len(running_tasks)>1:
		return False
	elif len(running_tasks)==1:
		response = client_autoscaling.set_desired_capacity(
		AutoScalingGroupName=autoscaling_group_name,
		DesiredCapacity=0)

if __name__ == "__main__":
  run()
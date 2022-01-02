import json
import time
import datetime
import os
import boto3

client = boto3.client("sqs")
client_autoscaling = boto3.client("autoscaling")
QueueUrl = os.environ.get("QUEUE_URL", '')
AutoScalingGroupName = os.environ.get("AUTOSCALING_GROUP_NAME", '')
ClusterName = os.environ.get("CLUSTER_NAME", '')

assert AutoScalingGroupName != '', 'Auto-Scaling group name should be defined.'
assert QueueUrl != '', 'Queue URL should be defined.'
assert ClusterName != '', 'Cluster name should be defined.'

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

  # Adjust the desired capacity of the AutoScalingGroup to 0.
  # This will terminate any instances that are still running.
  client_autoscaling.set_desired_capacity(
  AutoScalingGroupName=AutoScalingGroupName,
  DesiredCapacity=0)

if __name__ == "__main__":
  run()
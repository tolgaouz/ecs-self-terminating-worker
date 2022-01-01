import aws_cdk as core
import aws_cdk.assertions as assertions

from ecs_self_terminating_worker.ecs_self_terminating_worker_stack import EcsSelfTerminatingWorkerStack

# example tests. To run these tests, uncomment this file along with the example
# resource in ecs_self_terminating_worker/ecs_self_terminating_worker_stack.py
def test_sqs_queue_created():
    app = core.App()
    stack = EcsSelfTerminatingWorkerStack(app, "ecs-self-terminating-worker")
    template = assertions.Template.from_stack(stack)

#     template.has_resource_properties("AWS::SQS::Queue", {
#         "VisibilityTimeout": 300
#     })

#!/bin/bash

# Exit on error
set -e

# Check for gcloud
if ! command -v gcloud &> /dev/null; then
  echo "Error: 'gcloud' CLI is not installed or not in your PATH."
  echo "Please install the Google Cloud SDK and try again."
  echo "Download: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

SERVICE_NAME="nemoblocks"
REGION="us-west1"
PROJECT_ID="natural-engine-480714-u6"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: No Google Cloud project selected."
  echo "Run 'gcloud config set project <your-project-id>' first."
  exit 1
fi

echo "Deploying $SERVICE_NAME to $REGION in project $PROJECT_ID..."

# Build the container using Cloud Build
echo "Building container..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated

echo "Deployment complete!"

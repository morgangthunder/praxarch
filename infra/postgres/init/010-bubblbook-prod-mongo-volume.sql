-- Bubblbook production: ECR release pipeline + mongo volume pin.
UPDATE public.deploy_targets
SET deploy_profile_options = jsonb_build_object(
  'mongoDataVolume', 'nf6adysipbutbwzslufhhoqg_mongo_data',
  'includeMcpOverlay', true,
  'ecrRepository', '435214896413.dkr.ecr.eu-west-1.amazonaws.com/bubblbook/prod',
  'ecrRegion', 'eu-west-1',
  'ecrImageTag', 'v2',
  'ecrBuildServerUuid', 'rorxx790bkr8db4ssro9v5fh'
)
WHERE tenant_id = 'bubblbook'
  AND service_id = 'bubblbook'
  AND environment = 'production';

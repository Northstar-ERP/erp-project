from rest_framework.routers import SimpleRouter

from .views import NotificationViewSet

# SimpleRouter (not DefaultRouter): the empty prefix would collide with
# DefaultRouter's API root view.
router = SimpleRouter()
router.register('', NotificationViewSet, basename='notification')

urlpatterns = router.urls
